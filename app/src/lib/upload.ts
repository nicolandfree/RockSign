import type { CallLanguage } from "./transcribe.ts";

// Hands a recording from Home or Record to the processing page without putting it in the URL.
let pending: { file: File; lang: CallLanguage } | null = null;

export const setPendingUpload = (file: File, lang: CallLanguage) => { pending = { file, lang }; };
export const getPendingUpload = () => pending;
