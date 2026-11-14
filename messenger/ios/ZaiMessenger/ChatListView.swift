import SwiftUI

struct ChatListView: View {
    @Bindable var store: MessengerStore
    @State private var query = ""
    @State private var confirmingLogout = false

    var body: some View {
        NavigationStack(path: $store.path) {
            List {
                if let error = store.listError {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(error).foregroundStyle(.secondary)
                            Button("Повторить") { Task { await store.refresh(force: true) } }
                        }
                    }
                }
                if let snapshot = store.snapshot {
                    if snapshot.conversations.isEmpty {
                        ContentUnavailableView("Нет чатов", systemImage: "bubble.left.and.bubble.right")
                    } else if filtered(snapshot.conversations).isEmpty {
                        ContentUnavailableView.search(text: query)
                    } else {
                        ForEach(filtered(snapshot.conversations)) { chat in
                            NavigationLink(value: ThreadRoute.conversation(chat.id)) {
                                ChatRow(chat: chat)
                            }
                        }
                    }
                } else if store.listError == nil {
                    ProgressView("Загружаем чаты…")
                        .frame(maxWidth: .infinity)
                }
            }
            .listStyle(.plain)
            .navigationTitle("Чаты")
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Поиск чатов")
            .refreshable { await store.refresh(force: true) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Link(destination: URL(string: "https://msg.zai.su:8443/admin")!) {
                            Label("Настройки источников в Safari", systemImage: "safari")
                        }
                        Button("Выйти", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) {
                            confirmingLogout = true
                        }
                    } label: {
                        Label("Настройки", systemImage: "ellipsis.circle")
                    }
                    .disabled(store.sessionBusy || store.sending)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink(value: ThreadRoute.inbox) {
                        Label("Общая лента", systemImage: "tray")
                    }
                    .disabled(store.snapshot == nil)
                }
            }
            .navigationDestination(for: ThreadRoute.self) { route in
                ThreadView(store: store, route: route)
                    .id(route)
            }
            .confirmationDialog("Выйти из Messenger?", isPresented: $confirmingLogout, titleVisibility: .visible) {
                Button("Выйти", role: .destructive) { Task { await store.logout() } }
                Button("Отмена", role: .cancel) {}
            }
        }
    }

    private func filtered(_ conversations: [Conversation]) -> [Conversation] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return search.isEmpty ? conversations : conversations.filter { $0.title.localizedStandardContains(search) }
    }
}

private struct ChatRow: View {
    let chat: Conversation

    var body: some View {
        HStack(spacing: 12) {
            avatar
                .frame(width: 42, height: 42)
                .clipShape(Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 5) {
                    Text(chat.title).font(.headline).lineLimit(1)
                    if chat.pinOrder != nil {
                        Image(systemName: "pin.fill").font(.caption2).foregroundStyle(.secondary)
                            .accessibilityLabel("Закреплён")
                    }
                    Spacer(minLength: 4)
                    if let date = parseMessengerDate(chat.updatedAt) {
                        Text(date, format: Calendar.current.isDateInToday(date)
                             ? .dateTime.hour().minute() : .dateTime.day().month(.abbreviated))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Text(chat.preview.isEmpty ? " " : chat.preview)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if chat.unreadCount > 0 {
                Text(chat.unreadCount, format: .number)
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(.tint, in: Capsule())
                    .accessibilityLabel("Непрочитанных: \(chat.unreadCount)")
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var avatar: some View {
        if let thumbnail = chat.avatarThumbnail, thumbnail.hasPrefix("data:image/"),
           let encoded = thumbnail.split(separator: ",", maxSplits: 1).last,
           let bytes = Data(base64Encoded: String(encoded)), let image = UIImage(data: bytes) {
            Image(uiImage: image).resizable().scaledToFill()
        } else {
            let initials = String(chat.title.split(whereSeparator: \.isWhitespace).prefix(2).compactMap(\.first))
            ZStack {
                Circle().fill(Color.accentColor.opacity(0.14))
                Text(initials.uppercased()).font(.subheadline.weight(.semibold)).foregroundStyle(.tint)
            }
        }
    }
}

func parseMessengerDate(_ value: String) -> Date? {
    (try? Date(value, strategy: .iso8601.time(includingFractionalSeconds: true)))
        ?? (try? Date(value, strategy: .iso8601))
}
