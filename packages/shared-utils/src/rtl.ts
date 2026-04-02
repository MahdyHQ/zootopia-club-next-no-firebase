export function hasRtlCharacters(input: string) {
  return /[\u0591-\u07ff\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(input);
}

export function directionForText(input: string) {
  return hasRtlCharacters(input) ? "rtl" : "ltr";
}
