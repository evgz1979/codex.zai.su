// Точка расширения для следующего этапа. MVP ничего не извлекает и не запоминает.
export interface PersonalMemory {
  context(): Promise<string | null>;
}
export const personalMemory: PersonalMemory = { async context() { return null; } };
