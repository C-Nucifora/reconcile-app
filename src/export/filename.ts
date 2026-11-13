export function pdfFilename(groupName: string, date: string): string {
  const name = Array.from(groupName, (character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || (code >= 127 && code <= 159) ||
      /[\\/<>:"|?*\u202a-\u202e\u2066-\u2069]/u.test(character)
      ? "_" : character;
  }).slice(0, 100).join("").trim() || "Group";
  return `Reconcile - ${name} - ${date}.pdf`;
}
