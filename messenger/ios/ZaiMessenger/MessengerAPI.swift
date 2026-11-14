import Foundation
import Security

enum MessengerError: LocalizedError {
    case http(Int, String?)
    case invalidResponse
    case keychain
    case setupRequired

    var errorDescription: String? {
        switch self {
        case .http(let status, let message):
            message ?? "Сервер вернул ошибку HTTP \(status)."
        case .invalidResponse:
            "Сервер вернул неожиданный ответ."
        case .keychain:
            "Не удалось обновить сессию в Связке ключей."
        case .setupRequired:
            "Вход пока недоступен. Обратитесь к владельцу Messenger."
        }
    }

    var status: Int? {
        if case .http(let status, _) = self { return status }
        return nil
    }
}

@MainActor
protocol ChatCredentialStorage {
    func load() throws -> String?
    func save(_ token: String) throws
    func clear() throws
}

@MainActor
private struct ChatCredential: ChatCredentialStorage {
    private static let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "su.zai.messenger.chat",
        kSecAttrAccount as String: "https://msg.zai.su:8443/api/chat"
    ]

    func load() throws -> String? {
        var result: CFTypeRef?
        var request = Self.query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let token = String(data: data, encoding: .utf8), Self.valid(token) else {
            throw MessengerError.keychain
        }
        return token
    }

    static func valid(_ token: String) -> Bool {
        token.utf8.count == 64 && token.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }

    func save(_ token: String) throws {
        let value = [kSecValueData as String: Data(token.utf8)]
        var status = SecItemUpdate(Self.query as CFDictionary, value as CFDictionary)
        if status == errSecItemNotFound {
            var item = Self.query
            item[kSecValueData as String] = Data(token.utf8)
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            status = SecItemAdd(item as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw MessengerError.keychain }
    }

    func clear() throws {
        let status = SecItemDelete(Self.query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw MessengerError.keychain }
    }
}

private final class RejectRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping @Sendable (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

@MainActor
final class MessengerAPI {
    private static let origin = "https://msg.zai.su:8443"
    private static let cookieName = "__Secure-zai_chat"
    private let session: URLSession
    private let storage: any ChatCredentialStorage
    private var cookie: String?
    private var csrfToken: String?

    init(
        configuration: URLSessionConfiguration = .ephemeral,
        storage: (any ChatCredentialStorage)? = nil
    ) {
        self.storage = storage ?? ChatCredential()
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.urlCredentialStorage = nil
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 30
        session = URLSession(configuration: configuration, delegate: RejectRedirects(), delegateQueue: nil)
    }

    func restore() async throws -> Bool {
        cookie = try storage.load()
        guard cookie != nil else { return false }
        let (info, response) = try await request("session", as: SessionInfo.self)
        guard info.authenticated else {
            try forget()
            return false
        }
        try accept(info, response: response)
        return true
    }

    func login(password: String) async throws {
        let (info, response) = try await request("login", body: ["password": password], as: SessionInfo.self)
        try accept(info, response: response)
    }

    func logout() async throws {
        _ = try await request("logout", body: [String: String](), as: EmptyResponse.self)
        try forget()
    }

    func forget() throws {
        cookie = nil
        csrfToken = nil
        try storage.clear()
    }

    func access(since revision: Int) async throws -> AccessRevision {
        try await request("access?since=\(revision)", as: AccessRevision.self).0
    }

    func snapshot() async throws -> Snapshot {
        try await request("snapshot", as: Snapshot.self).0
    }

    func page(_ route: ThreadRoute, before: String? = nil) async throws -> PageResult {
        var body: [String: String] = [:]
        if let before { body["before"] = before }
        let action: String
        switch route {
        case .inbox:
            action = "inbox"
        case .conversation(let id):
            body["conversationId"] = id
            action = before == nil ? "open" : "older"
        }
        let result = try await request(action, body: body, as: PageResult.self).0
        guard result.page.conversationId == route.id else { throw MessengerError.invalidResponse }
        return result
    }

    func markRead(_ message: Message) async throws -> Snapshot {
        let body = ["conversationId": message.conversationId, "messageId": message.id]
        return try await request("read", body: body, as: Snapshot.self).0
    }

    func send(_ text: String, to destination: Destination, requestID: UUID) async throws -> Message {
        let payload = SendRequest(destination: destination, text: text, requestId: requestID.uuidString)
        let message = try await request("send", body: payload, as: Message.self).0
        guard message.outgoing, message.conversationId == destination.conversationId,
              message.sourceId == destination.sourceId else { throw MessengerError.invalidResponse }
        return message
    }

    private func accept(_ info: SessionInfo, response: HTTPURLResponse) throws {
        if info.setupRequired { throw MessengerError.setupRequired }
        guard info.authenticated, let csrf = info.csrfToken, !csrf.isEmpty,
              let url = response.url, let header = response.value(forHTTPHeaderField: "Set-Cookie"),
              let sessionCookie = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: url)
                  .first(where: { $0.name == Self.cookieName && $0.path == "/api/chat" && $0.isSecure }),
              ChatCredential.valid(sessionCookie.value) else {
            throw MessengerError.invalidResponse
        }
        if cookie != sessionCookie.value {
            try storage.save(sessionCookie.value)
        }
        cookie = sessionCookie.value
        csrfToken = csrf
    }

    private func request<T: Decodable>(
        _ action: String, body: (any Encodable)? = nil, as type: T.Type
    ) async throws -> (T, HTTPURLResponse) {
        try Task.checkCancellation()
        let url = URL(string: "\(Self.origin)/api/chat/\(action)")!
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie {
            request.setValue("\(Self.cookieName)=\(cookie)", forHTTPHeaderField: "Cookie")
        }
        if let body {
            request.httpMethod = "POST"
            request.setValue(Self.origin, forHTTPHeaderField: "Origin")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            if let csrfToken { request.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token") }
            request.httpBody = try JSONEncoder().encode(body)
        }
        let (data, rawResponse) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = rawResponse as? HTTPURLResponse else { throw MessengerError.invalidResponse }
        guard (200...299).contains(response.statusCode) else {
            let payload = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw MessengerError.http(response.statusCode, payload?.error)
        }
        guard let value = try? JSONDecoder().decode(type, from: data) else {
            throw MessengerError.invalidResponse
        }
        return (value, response)
    }

    private struct EmptyResponse: Decodable {}
    private struct ErrorResponse: Decodable { let error: String }
    private struct SendRequest: Encodable {
        let destination: Destination
        let text: String
        let requestId: String
    }
}
