export interface MessagingProvider {
  sendText(telefone: string, text: string): Promise<void>;
}
