export interface ToastMessage {
  id: number;
  text: string;
  tone: "info" | "success" | "error" | "warning";
}
