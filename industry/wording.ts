// 讀者看得到的文字裡本站不用的詞，每項是要找的寫法和改法（例如 [/重磅|炸裂/u, "不用誇張的說法，直接寫發生了什麼"]）。
// 寫作那一步寫完中文標題、摘要和推薦理由後逐個查，用了就讓模型只改這些地方一次（packages/backend/src/editorial/
// analyze.ts 的 mendWording）。只列一眼就能判斷的寫法：拿不準的不列，否則會誤改正常的詞。空著就不查。

export const READER_WORDING: ReadonlyArray<readonly [RegExp, string]> = [];
