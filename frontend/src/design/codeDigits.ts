/**
 * What a one-time code field keeps of what was typed or pasted: the digits, at most `length` of them.
 * Pasting "123 456" from an email gives "123456". The field itself has no maxLength, because a browser cuts a pasted
 * text to that length before our code sees it, so the space would cost the sixth digit.
 */
export function codeDigits(value: string, length = 6): string {
  return value.replace(/\D/g, "").slice(0, length);
}
