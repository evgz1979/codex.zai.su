import SwiftUI

struct ThreadView: View {
    let store: MessengerStore
    let route: ThreadRoute
    @Environment(\.scenePhase) private var scenePhase
    @State private var visibleIDs = Set<String>()
    @State private var atBottom = true
    @State private var confirmingRetry = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 9) {
                    if let page = store.page, page.conversationId == route.id {
                        if page.nextCursor != nil {
                            Button {
                                Task {
                                    let anchor = page.messages.first?.id
                                    await store.loadThread(route, older: true)
                                    if let anchor { proxy.scrollTo(anchor, anchor: .top) }
                                }
                            } label: {
                                if store.loadingOlder { ProgressView() }
                                else { Text("Загрузить предыдущие сообщения") }
                            }
                            .disabled(store.loadingOlder || store.sending)
                            .padding(.vertical, 8)
                        }
                        if page.messages.isEmpty {
                            ContentUnavailableView(
                                page.historyComplete == false ? "История загружается" : "Нет сообщений",
                                systemImage: "bubble.left"
                            )
                        }
                        ForEach(page.messages) { message in
                            MessageRow(message: message, from: chatName(for: message))
                                .id(message.id)
                        }
                    } else if store.threadError == nil {
                        ProgressView("Загружаем сообщения…").padding(24)
                    }
                }
                .scrollTargetLayout()
                .padding(14)
                Color.clear.frame(height: 1).id(ScrollAnchor.bottom)
            }
            .background(Color(uiColor: .secondarySystemBackground))
            .defaultScrollAnchor(.bottom, for: .initialOffset)
            .scrollDismissesKeyboard(.interactively)
            .onScrollTargetVisibilityChange(idType: String.self, threshold: 0.5) { ids in
                visibleIDs = Set(ids)
            }
            .onScrollGeometryChange(for: Bool.self) { geometry in
                geometry.visibleRect.maxY >= geometry.contentSize.height - 44
            } action: { _, nearBottom in
                atBottom = nearBottom
            }
            .onChange(of: store.page?.messages.last?.id) { previous, _ in
                if previous == nil || atBottom { proxy.scrollTo(ScrollAnchor.bottom, anchor: .bottom) }
            }
            .onChange(of: store.lastSentID) { _, messageID in
                if let messageID { proxy.scrollTo(messageID, anchor: .bottom) }
            }
            .refreshable { await store.loadThread(route) }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if let error = store.threadError {
                        status(error, action: "Повторить") { Task { await store.loadThread(route) } }
                    }
                    if case .conversation(let id) = route, let chat = store.conversation(id) {
                        composer(chat)
                    }
                }
                .background(.bar)
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Обновить", systemImage: "arrow.clockwise") {
                    Task { await store.loadThread(route) }
                }
                .disabled(store.loadingThread || store.loadingOlder || store.sending)
            }
        }
        .task { await store.loadThread(route) }
        .task(id: readPositions) {
            let messages = readPositions.messages
            guard !messages.isEmpty else { return }
            do { try await Task.sleep(for: .milliseconds(600)) } catch { return }
            await store.markVisibleRead(messages, in: route)
        }
    }

    private var title: String {
        switch route {
        case .inbox: "Общая лента"
        case .conversation(let id): store.conversation(id)?.title ?? "Чат"
        }
    }

    private func chatName(for message: Message) -> String? {
        guard route == .inbox else { return nil }
        return store.conversation(message.conversationId)?.title
    }

    private var readPositions: ReadPositions {
        let messages = scenePhase == .active ? store.readCandidates(visible: visibleIDs, in: route) : []
        return ReadPositions(messages: messages)
    }

    @ViewBuilder private func composer(_ chat: Conversation) -> some View {
        if chat.canSend {
            let draft = store.drafts[chat.id] ?? ""
            let review = store.sendReviews[chat.id]
            if review == .refresh {
                status("Результат отправки неизвестен. Обновите чат и проверьте переписку.", action: "Обновить") {
                    Task { await store.loadThread(route) }
                }
            } else if review == .confirm {
                status("Сверьте переписку перед повторной отправкой.", action: "Сверено") {
                    confirmingRetry = true
                }
            }
            if draft.utf16.count > 4096 {
                Text("Максимум 4096 символов UTF-16").font(.footnote).foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField("Сообщение", text: Binding(
                    get: { store.drafts[chat.id] ?? "" },
                    set: { store.draft(chat.id, text: $0) }
                ), axis: .vertical)
                .lineLimit(1...5)
                .padding(10)
                .background(Color(uiColor: .systemBackground), in: RoundedRectangle(cornerRadius: 16))
                .disabled(store.sending || review != nil)

                Button {
                    Task { await store.send(to: chat.id) }
                } label: {
                    if store.sending {
                        ProgressView().frame(width: 44, height: 44)
                    } else {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.system(size: 34))
                            .frame(width: 44, height: 44)
                    }
                }
                .accessibilityLabel("Отправить сообщение")
                .disabled(store.sending || review != nil || store.loadingThread || store.loadingOlder
                          || store.page?.conversationId != chat.id || draft.utf16.count > 4096
                          || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .confirmationDialog("Сообщение появилось в чате?", isPresented: $confirmingRetry, titleVisibility: .visible) {
                Button("Да, очистить черновик") { store.resolveSendReview(chat.id, clearDraft: true) }
                Button("Нет, оставить черновик") { store.resolveSendReview(chat.id, clearDraft: false) }
                Button("Отмена", role: .cancel) {}
            }
        } else {
            Text("Чат доступен только для чтения")
                .font(.footnote).foregroundStyle(.secondary)
                .padding(12)
                .frame(maxWidth: .infinity)
        }
    }

    private func status(_ message: String, action: String, perform: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message).font(.footnote)
            Button(action, action: perform).font(.footnote.weight(.semibold))
                .frame(minHeight: 32)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private enum ScrollAnchor { case bottom }

    private struct ReadPositions: Equatable {
        let messages: [Message]

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.messages.map(\.id) == rhs.messages.map(\.id)
        }
    }
}

private struct MessageRow: View {
    let message: Message
    let from: String?

    var body: some View {
        HStack(alignment: .bottom) {
            if message.outgoing { Spacer(minLength: 32) }
            VStack(alignment: .leading, spacing: 5) {
                if let from {
                    Text(from).font(.caption.weight(.semibold)).foregroundStyle(.tint)
                }
                if !message.outgoing {
                    Text(message.sender.name).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                if !message.text.isEmpty {
                    Text(message.text).textSelection(.enabled)
                }
                ForEach(message.attachments) { attachment in
                    Label(attachment.name, systemImage: "paperclip")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if let date = parseMessengerDate(message.date) {
                    Text(date, format: .dateTime.day().month(.abbreviated).hour().minute())
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                message.outgoing ? Color.green.opacity(0.16) : Color(uiColor: .systemBackground),
                in: RoundedRectangle(cornerRadius: 16)
            )
            if !message.outgoing { Spacer(minLength: 32) }
        }
    }
}
