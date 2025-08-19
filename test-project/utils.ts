export function formatNumber(num: number): string {
  return num.toLocaleString();
}

export function isEven(num: number): boolean {
  return num % 2 === 0;
}

export class Logger {
  log(message: string): void {
    console.log(`[LOG] ${message}`);
  }
}