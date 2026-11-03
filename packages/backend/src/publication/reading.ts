import { sql, type Db } from "../db.ts";
import { emit } from "../modules.ts";

interface Section { heading: string; paragraphs: string[] }
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** 所有閱讀出口共用的可見性與版本檢查；原文永遠不由這個出口回傳。 */
export async function articleReadingHtml(articleId: string): Promise<string | null> {
  const [row] = await sql<{ sections: Section[] }[]>`SELECT r.sections FROM article_readings r
    JOIN articles a ON a.id=r.article_id JOIN publications p ON p.article_id=a.id JOIN sources s ON s.id=p.source_id JOIN analyses an ON an.id=p.analysis_id
    LEFT JOIN editorial_overrides e ON e.article_id=a.id
    WHERE a.id=${articleId} AND p.eligible AND p.visibility='public' AND s.participation_mode='editorial'
      AND an.input_revision=a.revision AND r.input_revision=a.revision AND r.analysis_id=p.analysis_id
      AND r.override_version=coalesce(e.version,0)`;
  if (!row) return null;
  return row.sections.map(section => `<h2>${escape(section.heading)}</h2>${section.paragraphs.map(p => `<p>${escape(p)}</p>`).join("")}`).join("");
}

export async function announceArticleReading(db: Db, articleId: string) {
  await db`UPDATE publications SET updated_at=now() WHERE article_id=${articleId}`;
  await emit("articleChanged", { id: articleId, kind: "body", reason: "AI reading" }, db);
}
