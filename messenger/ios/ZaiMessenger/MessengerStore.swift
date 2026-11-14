import Foundation
import Observation

@MainActor
@Observable
final class MessengerStore {
    enum Phase {
        case restoring, login, chats
    }

    enum SendReview {
        case refresh, confirm
    }

    private(set) var phase = Phase.restoring
    private(set) var snapshot: Snapshot?
    private(set) var page: ConversationPage?
    private(set) var sessionBusy = false
    private(set) var loadingThread = false
    private(set) var loadingOlder = false
    private(set) var sending = false
    private(set) var sessionError: String?
    private(set) var listError: String?
    private(set) var threadError: String?
    private(set) var drafts: [String: String] = [:]
    private(set) var sendReviews: [String: SendReview] = [:]
    private(set) var lastSentID: String?

    var path: [ThreadRoute] = [] {
        didSet {
            guard path.last != oldValue.last else { return }
            version += 1
            threadGeneration += 1
            loadingThread = false
            loadingOlder = false
            page = nil
            threadError = nil
        }
    }

    private let api = MessengerAPI()
    private var revision: Int?
    private var version = 0
    private var threadGeneration = 0
    private var sessionGeneration = 0
    private var refreshing = false
    private var recordingRead = false
    private var confirmedReads: [String: Message] = [:]
    private var failedReads: [String: Date] = [:]

    func conversation(_ id: String) -> Conversation? {
        snapshot?.conversations.first { $0.id == id }
    }

    func draft(_ id: String, text: String) {
        drafts[id] = text
    }

    func runWhileActive() async {
        while !Task.isCancelled {
            if phase == .restoring, sessionError == nil { await restore() }
            await refresh()
            do { try await Task.sleep(for: .seconds(3)) } catch { return }
        }
    }

    func restore() async {
        guard phase == .restoring, !sessionBusy else { return }
        sessionBusy = true
        sessionError = nil
        do {
            phase = try await api.restore() ? .chats : .login
        } catch {
            if !Task.isCancelled { sessionError = Self.description(of: error) }
        }
        sessionBusy = false
        await refresh(force: true)
    }

    func login(password: String) async {
        guard phase == .login, !sessionBusy else { return }
        sessionBusy = true
        sessionError = nil
        do {
            try await api.login(password: password)
            phase = .chats
        } catch {
            if !Task.isCancelled { sessionError = Self.description(of: error) }
        }
        sessionBusy = false
        await refresh(force: true)
    }

    func logout() async {
        guard phase == .chats, !sessionBusy, !sending else { return }
        sessionBusy = true
        version += 1
        defer { sessionBusy = false }
        do {
            try await api.logout()
            endSession()
        } catch {
            if handleExpiredSession(error) { return }
            if case MessengerError.keychain = error {
                endSession(message: Self.description(of: error))
            } else if !Task.isCancelled {
                listError = Self.description(of: error)
            }
        }
    }

    // Серверная ревизия относится к SQLite. Опрос обновляет только текущее окно.
    func refresh(force: Bool = false) async {
        guard phase == .chats, !sessionBusy, !refreshing, !loadingThread, !loadingOlder,
              !sending, !recordingRead else { return }
        refreshing = true
        defer { refreshing = false }
        let expected = version
        let route = path.last
        do {
            let access = try await api.access(since: revision ?? 0)
            guard expected == version, !Task.isCancelled else { return }
            let allowed = Set(access.ids)
            let reset = access.reset || (revision.map { access.revision < $0 } ?? false)
            applyAccess(allowed, deleted: Set(access.deletedIds), reset: reset)
            if case .conversation(let id) = route, !allowed.contains(id) {
                path = []
                return
            }
            let retrying = route == nil ? listError != nil : threadError != nil
            let needsPage = route != nil && page == nil
            guard force || reset || revision != access.revision || retrying || needsPage else { return }

            if let route {
                let result = try await api.page(route)
                guard expected == version, !Task.isCancelled else { return }
                snapshot = result.snapshot
                applyFreshPage(result.page)
                threadError = nil
                listError = nil
            } else {
                let result = try await api.snapshot()
                guard expected == version, !Task.isCancelled else { return }
                snapshot = result
                listError = nil
            }
            revision = access.revision
        } catch {
            guard expected == version, !Task.isCancelled else { return }
            report(error, for: route)
        }
    }

    func loadThread(_ route: ThreadRoute, older: Bool = false) async {
        guard phase == .chats, path.last == route, !sessionBusy, !loadingThread, !loadingOlder,
              !sending else { return }
        let cursor = older ? page?.nextCursor : nil
        if older && cursor == nil { return }
        loadingThread = !older
        loadingOlder = older
        version += 1
        let generation = threadGeneration
        defer {
            if generation == threadGeneration {
                loadingThread = false
                loadingOlder = false
            }
        }
        do {
            let result = try await api.page(route, before: cursor)
            guard generation == threadGeneration, !Task.isCancelled else { return }
            snapshot = result.snapshot
            if older, var current = page {
                let existing = Set(current.messages.map(\.id))
                current.messages = result.page.messages.filter { !existing.contains($0.id) } + current.messages
                current.nextCursor = result.page.nextCursor
                current.oldestCursor = result.page.oldestCursor ?? current.oldestCursor
                current.historyComplete = result.page.historyComplete
                page = current
                threadError = result.page.messages.isEmpty && result.page.nextCursor == cursor
                    ? "Сервер ещё загружает историю. Попробуйте позже." : nil
            } else {
                applyFreshPage(result.page)
                threadError = nil
                if case .conversation(let id) = route, sendReviews[id] == .refresh {
                    sendReviews[id] = .confirm
                }
            }
        } catch {
            guard generation == threadGeneration, !Task.isCancelled else { return }
            report(error, for: route)
        }
    }

    func send(to id: String) async {
        guard phase == .chats, path.last == .conversation(id), page?.conversationId == id,
              !sending, !loadingThread, !loadingOlder, !sessionBusy,
              sendReviews[id] == nil, let target = conversation(id), target.canSend,
              let text = drafts[id], !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              text.utf16.count <= 4096 else { return }
        sending = true
        threadError = nil
        version += 1
        let generation = sessionGeneration
        defer { sending = false }
        do {
            let message = try await api.send(text, to: target.destination, requestID: UUID())
            guard generation == sessionGeneration else { return }
            if drafts[id] == text { drafts[id] = nil }
            if path.last == .conversation(id), var current = page {
                current.messages.removeAll { $0.id == message.id }
                current.messages.append(message)
                current.messages.sort(by: Message.historyOrder)
                page = current
                lastSentID = message.id
            }
            revision = nil
        } catch {
            guard generation == sessionGeneration, !handleExpiredSession(error) else { return }
            if let status = (error as? MessengerError)?.status, (400..<500).contains(status) {
                if path.last == .conversation(id) { threadError = Self.description(of: error) }
                revision = nil
            } else {
                sendReviews[id] = .refresh
            }
        }
    }

    func resolveSendReview(_ id: String, clearDraft: Bool) {
        guard sendReviews[id] == .confirm else { return }
        if clearDraft { drafts[id] = nil }
        sendReviews[id] = nil
    }

    func readCandidates(visible ids: Set<String>, in route: ThreadRoute) -> [Message] {
        guard let page, page.conversationId == route.id,
              !loadingThread, let snapshot else { return [] }
        let sources = Dictionary(uniqueKeysWithValues: snapshot.sources.map { ($0.id, $0.canMarkRead != false) })
        let unread = Set(snapshot.conversations.filter { $0.unreadCount > 0 }.map(\.id))
        let visible = page.messages.filter {
            ids.contains($0.id) && !$0.outgoing && unread.contains($0.conversationId) && sources[$0.sourceId] == true
        }
        return Dictionary(grouping: visible, by: \.conversationId).values.compactMap {
            $0.max(by: Message.readOrder)
        }.sorted { $0.conversationId < $1.conversationId }
    }

    func markVisibleRead(_ candidates: [Message], in route: ThreadRoute) async {
        guard phase == .chats, path.last == route, !recordingRead,
              !loadingThread, !loadingOlder, !sending, !sessionBusy else { return }
        recordingRead = true
        version += 1
        let generation = threadGeneration
        defer { recordingRead = false }
        for message in candidates {
            guard !Task.isCancelled, generation == threadGeneration,
                  !sending, !loadingThread, !loadingOlder else { return }
            let id = message.conversationId
            if let previous = confirmedReads[id], !Message.readOrder(previous, message) { continue }
            if let failed = failedReads[id], Date().timeIntervalSince(failed) < 30 { continue }
            do {
                let result = try await api.markRead(message)
                guard generation == threadGeneration, !sending, !loadingThread, !loadingOlder else { return }
                snapshot = result
                confirmedReads[id] = message
                failedReads[id] = nil
            } catch {
                if Task.isCancelled || handleExpiredSession(error) { return }
                failedReads[id] = Date()
            }
        }
    }

    private func applyAccess(_ allowed: Set<String>, deleted: Set<String>, reset: Bool) {
        if let current = snapshot, current.conversations.contains(where: { !allowed.contains($0.id) }) {
            snapshot = Snapshot(sources: current.sources, conversations: current.conversations.filter { allowed.contains($0.id) })
        }
        if drafts.keys.contains(where: { !allowed.contains($0) }) {
            drafts = drafts.filter { allowed.contains($0.key) }
        }
        if sendReviews.keys.contains(where: { !allowed.contains($0) }) {
            sendReviews = sendReviews.filter { allowed.contains($0.key) }
        }
        confirmedReads = reset ? [:] : confirmedReads.filter { allowed.contains($0.key) && !deleted.contains($0.value.id) }
        if reset {
            page = nil
        } else if page?.messages.contains(where: { !allowed.contains($0.conversationId) || deleted.contains($0.id) }) == true {
            page?.messages.removeAll { !allowed.contains($0.conversationId) || deleted.contains($0.id) }
        }
    }

    private func applyFreshPage(_ fresh: ConversationPage) {
        guard let previous = page, previous.conversationId == fresh.conversationId,
              let first = fresh.messages.first else {
            page = fresh
            return
        }
        let earlier = previous.messages.filter { Message.historyOrder($0, first) }
        var merged = fresh
        merged.messages = earlier + fresh.messages
        if !earlier.isEmpty {
            merged.oldestCursor = previous.oldestCursor
            merged.nextCursor = previous.nextCursor ?? (fresh.historyComplete == false ? previous.oldestCursor : nil)
        }
        page = merged
    }

    private func report(_ error: Error, for route: ThreadRoute?) {
        if handleExpiredSession(error) { return }
        if case .conversation(let id) = route, (error as? MessengerError)?.status == 404 {
            snapshot = nil
            revision = nil
            drafts[id] = nil
            sendReviews[id] = nil
            path = []
            return
        }
        if case .conversation = route, (error as? MessengerError)?.status == 403 {
            page = nil
            revision = nil
        }
        if route == nil { listError = Self.description(of: error) }
        else { threadError = Self.description(of: error) }
    }

    private func handleExpiredSession(_ error: Error) -> Bool {
        guard (error as? MessengerError)?.status == 401 else { return false }
        do {
            try api.forget()
            endSession(message: "Сессия истекла. Войдите снова.")
        } catch {
            endSession(message: Self.description(of: error))
        }
        return true
    }

    private func endSession(message: String? = nil) {
        version += 1
        sessionGeneration += 1
        phase = .login
        path = []
        snapshot = nil
        drafts = [:]
        sendReviews = [:]
        confirmedReads = [:]
        failedReads = [:]
        revision = nil
        lastSentID = nil
        listError = nil
        threadError = nil
        sessionError = message
    }

    private static func description(of error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost:
                return "Нет связи с Messenger. Проверьте подключение."
            case .timedOut:
                return "Сервер долго не отвечает. Попробуйте ещё раз."
            default:
                return "Не удалось соединиться с Messenger."
            }
        }
        return error.localizedDescription
    }
}
