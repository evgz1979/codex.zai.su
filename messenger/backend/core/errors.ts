//: Представляет безопасную прикладную ошибку.
//: HTTP сериализует только status и message, без внутренних исключений.
export class AppError extends Error {
  //: Создаёт прикладную ошибку с безопасным текстом.
  //: HTTP-ответ не включает стек или секреты провайдера.
  constructor(public status: number, message: string, public retryAfterSeconds?:number) { super(message); } }
