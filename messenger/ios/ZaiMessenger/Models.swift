import Foundation

struct SessionInfo: Decodable {
    let authenticated: Bool
    let setupRequired: Bool
    let csrfToken: String?
}

struct Conversation: Decodable, Identifiable {
    struct Recipient: Decodable {
        let id: String
    }

    let id: String
    let sourceId: String
    let title: String
    let recipient: Recipient
    let unreadCount: Int
    let preview: String
    let updatedAt: String
    let pinOrder: Int?
    let avatarThumbnail: String?
    let canSend: Bool

    var destination: Destination {
        Destination(sourceId: sourceId, conversationId: id, recipientId: recipient.id)
    }
}

struct Destination: Encodable {
    let sourceId: String
    let conversationId: String
    let recipientId: String
}

struct Message: Decodable, Identifiable {
    struct Sender: Decodable {
        let name: String
    }

    struct Attachment: Decodable, Identifiable {
        let id: String
        let name: String
    }

    let id: String
    let sourceId: String
    let conversationId: String
    let sender: Sender
    let date: String
    let text: String
    let outgoing: Bool
    let attachments: [Attachment]
    let sequence: Int?

    static func historyOrder(_ a: Self, _ b: Self) -> Bool {
        a.date == b.date ? a.id < b.id : a.date < b.date
    }

    static func readOrder(_ a: Self, _ b: Self) -> Bool {
        if a.date == b.date,
           let first = a.sourceSequence, let second = b.sourceSequence, first != second {
            return first < second
        }
        return historyOrder(a, b)
    }

    private var sourceSequence: Int? {
        if let sequence { return sequence }
        guard let separator = id.range(of: "%2F", options: .backwards) else { return nil }
        let suffix = id[separator.upperBound...]
        return suffix.count <= 10 ? Int(suffix) : nil
    }
}

struct Snapshot: Decodable {
    struct Source: Decodable, Identifiable {
        let id: String
        let kind: String
        let canMarkRead: Bool?
    }

    let sources: [Source]
    let conversations: [Conversation]
}

struct ConversationPage: Decodable {
    let conversationId: String
    var messages: [Message]
    var nextCursor: String?
    var oldestCursor: String?
    var historyComplete: Bool?
}

struct PageResult: Decodable {
    let snapshot: Snapshot
    let page: ConversationPage
}

struct AccessRevision: Decodable {
    let ids: [String]
    let revision: Int
    let deletedIds: [String]
    let reset: Bool
}

enum ThreadRoute: Hashable {
    case inbox
    case conversation(String)

    var id: String {
        switch self {
        case .inbox: "inbox"
        case .conversation(let id): id
        }
    }
}
