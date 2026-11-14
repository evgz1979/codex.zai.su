import Foundation

// Ответы повторяют публичный контракт Messenger, проверка работает без сети.
private final class MessengerFixture: URLProtocol, @unchecked Sendable {
    static let token = String(repeating: "a", count: 64)
    static let csrf = String(repeating: "b", count: 64)
    static let conversation = "telegram:test:chat"
    static let chat = """
        {"id":"\(conversation)","sourceId":"telegram:test","title":"Тест","recipient":{"id":"peer"},
        "unreadCount":1,"preview":"Сообщение","updatedAt":"2026-11-14T12:00:00.000Z","canSend":true}
        """
    static let snapshot = #"{"sources":[{"id":"telegram:test","kind":"telegram"}],"conversations":[\#(chat)]}"#
    static let incoming = """
        {"id":"incoming","sourceId":"telegram:test","conversationId":"\(conversation)","sender":{"name":"Тест"},
        "date":"2026-11-14T12:00:00.000Z","text":"Сообщение","outgoing":false,"attachments":[]}
        """
    static let outgoing = """
        {"id":"outgoing","sourceId":"telegram:test","conversationId":"\(conversation)","sender":{"name":"Я"},
        "date":"2026-11-14T12:01:00.000Z","text":"Проверка","outgoing":true,"attachments":[]}
        """

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let url = request.url, url.scheme == "https", url.host == "msg.zai.su", url.port == 8443,
              url.path.hasPrefix("/api/chat/") else {
            return respond(400, #"{"error":"bad URL"}"#)
        }
        let action = String(url.path.dropFirst("/api/chat/".count))
        let cookie = request.value(forHTTPHeaderField: "Cookie")
        if request.httpMethod == "POST" {
            guard request.value(forHTTPHeaderField: "Origin") == "https://msg.zai.su:8443",
                  request.value(forHTTPHeaderField: "Content-Type") == "application/json" else {
                return respond(403, #"{"error":"bad Origin or content type"}"#)
            }
            if action != "login" && request.value(forHTTPHeaderField: "X-CSRF-Token") != Self.csrf {
                return respond(403, #"{"error":"bad CSRF"}"#)
            }
        }
        if action == "login" || action == "session" {
            if action == "session" && cookie == nil {
                return respond(200, #"{"authenticated":false,"setupRequired":false}"#)
            }
            if action == "login", payload()?["password"] as? String != "fixture" {
                return respond(401, #"{"error":"Неверный пароль."}"#)
            }
            return respond(200, #"{"authenticated":true,"setupRequired":false,"csrfToken":"\#(Self.csrf)"}"#, cookie: true)
        }
        guard cookie == "__Secure-zai_chat=\(Self.token)" else {
            return respond(401, #"{"error":"missing cookie"}"#)
        }
        let body = payload()
        switch action {
        case "access" where url.query == "since=7":
            respond(200, #"{"ids":["\#(Self.conversation)"],"revision":8,"deletedIds":["old"],"reset":false}"#)
        case "snapshot",
             "read" where body?["messageId"] as? String == "incoming":
            respond(200, Self.snapshot)
        case "open", "older", "inbox":
            let id = action == "inbox" ? "inbox" : body?["conversationId"] as? String
            guard let id, action != "older" || body?["before"] as? String == "previous" else {
                return respond(400, #"{"error":"bad page request"}"#)
            }
            let cursor = action == "older" ? "null" : #""previous""#
            respond(200, #"{"snapshot":\#(Self.snapshot),"page":{"conversationId":"\#(id)","messages":[\#(Self.incoming)],"nextCursor":\#(cursor)}}"#)
        case "send":
            guard let destination = body?["destination"] as? [String: String],
                  destination == ["sourceId": "telegram:test", "conversationId": Self.conversation, "recipientId": "peer"],
                  (body?["requestId"] as? String).flatMap(UUID.init(uuidString:)) != nil,
                  body?["text"] as? String == "Проверка" else {
                return respond(409, #"{"error":"bad destination or body"}"#)
            }
            respond(200, Self.outgoing)
        case "logout":
            respond(200, #"{"ok":true}"#)
        default:
            respond(404, #"{"error":"unexpected request"}"#)
        }
    }

    private func payload() -> [String: Any]? {
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func respond(_ status: Int, _ body: String, cookie: Bool = false) {
        var headers = ["Content-Type": "application/json"]
        if cookie { headers["Set-Cookie"] = "__Secure-zai_chat=\(Self.token); HttpOnly; SameSite=Strict; Path=/api/chat; Max-Age=15551999; Secure" }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/2", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

@MainActor
private final class MemoryCredential: ChatCredentialStorage {
    var token: String?
    func load() throws -> String? { token }
    func save(_ token: String) throws { self.token = token }
    func clear() throws { token = nil }
}

@main
struct ContractSmoke {
    @MainActor
    static func main() async throws {
        let storage = MemoryCredential()
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MessengerFixture.self]
        let api = MessengerAPI(configuration: configuration, storage: storage)
        let noSession = try await api.restore()
        precondition(!noSession)
        do {
            try await api.login(password: "wrong")
            preconditionFailure("Неверный пароль был принят")
        } catch let error as MessengerError {
            precondition(error.status == 401)
        }
        try await api.login(password: "fixture")
        precondition(storage.token == MessengerFixture.token)

        let restarted = MessengerAPI(configuration: configuration, storage: storage)
        let restored = try await restarted.restore()
        precondition(restored)
        let access = try await restarted.access(since: 7)
        precondition(access.revision == 8 && access.deletedIds == ["old"])
        let snapshot = try await restarted.snapshot()
        let chat = snapshot.conversations[0]
        let route = ThreadRoute.conversation(chat.id)
        let latest = try await restarted.page(route).page
        let previous = try await restarted.page(route, before: latest.nextCursor).page
        precondition(latest.messages.first?.text == "Сообщение" && previous.nextCursor == nil)
        let inbox = try await restarted.page(.inbox).page
        precondition(inbox.messages.count == 1)
        _ = try await restarted.markRead(inbox.messages[0])
        let sent = try await restarted.send("Проверка", to: chat.destination, requestID: UUID())
        precondition(sent.id == "outgoing" && sent.text == "Проверка")
        try await restarted.logout()
        precondition(storage.token == nil)
        print("Контракт iOS-клиента: вход, восстановление, страницы, прочтение, отправка и выход прошли.")
    }
}
