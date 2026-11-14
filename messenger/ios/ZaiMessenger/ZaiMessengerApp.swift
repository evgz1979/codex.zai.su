import SwiftUI

@main
struct ZaiMessengerApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @State private var store = MessengerStore()

    var body: some Scene {
        WindowGroup {
            Group {
                switch store.phase {
                case .restoring:
                    if let error = store.sessionError {
                        ContentUnavailableView {
                            Label("Messenger", systemImage: "exclamationmark.circle")
                        } description: {
                            Text(error)
                        } actions: {
                            Button("Повторить") { Task { await store.restore() } }
                                .buttonStyle(.borderedProminent)
                        }
                    } else {
                        ProgressView("Проверяем вход…")
                    }
                case .login:
                    LoginView(store: store)
                case .chats:
                    ChatListView(store: store)
                }
            }
            .tint(Color(red: 0.10, green: 0.43, blue: 0.77))
            .task(id: scenePhase) {
                if scenePhase == .active { await store.runWhileActive() }
            }
        }
    }
}

private struct LoginView: View {
    let store: MessengerStore
    @State private var password = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
                Text("Z AI Messenger")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)

                SecureField("Пароль чата", text: $password)
                    .textContentType(.password)
                    .submitLabel(.go)
                    .padding(14)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                    .disabled(store.sessionBusy)
                    .onSubmit(signIn)

                if let error = store.sessionError {
                    Text(error).foregroundStyle(.red).accessibilityAddTraits(.updatesFrequently)
                }
                Button(action: signIn) {
                    Group {
                        if store.sessionBusy { ProgressView().tint(.white) }
                        else { Text("Войти").fontWeight(.semibold) }
                    }
                    .frame(maxWidth: .infinity, minHeight: 34)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(password.isEmpty || store.sessionBusy)
            }
            .frame(maxWidth: 420)
            .padding(24)
            .containerRelativeFrame(.vertical, alignment: .center)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func signIn() {
        guard !password.isEmpty, !store.sessionBusy else { return }
        let entered = password
        password = ""
        Task { await store.login(password: entered) }
    }
}
