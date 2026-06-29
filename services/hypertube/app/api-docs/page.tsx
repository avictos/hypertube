import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
    title: "API Docs — Hypertube",
};

function readApiDocs(): string {
    const docPath = path.join(process.cwd(), "docs", "API.md");
    return fs.readFileSync(docPath, "utf-8");
}

export default function ApiDocsPage() {
    const content = readApiDocs();

    return (
        <main className="mx-auto max-w-3xl px-6 py-12">
            <article
                className="
                    [&>h1]:mt-0 [&>h1]:mb-4 [&>h1]:text-3xl [&>h1]:font-bold
                    [&>h2]:mt-10 [&>h2]:mb-3 [&>h2]:border-b [&>h2]:border-border [&>h2]:pb-2 [&>h2]:text-xl [&>h2]:font-semibold
                    [&>h3]:mt-4 [&>h3]:font-mono [&>h3]:text-base [&>h3]:font-semibold [&>h3]:text-foreground
                    [&>p]:my-3 [&>p]:leading-relaxed [&>p]:text-muted-foreground
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2
                    [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_li]:text-muted-foreground
                    [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm
                    [&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed
                    [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
                    [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left
                    [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2
                    [&_hr]:my-8 [&_hr]:border-border
                    [&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground
                "
            >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {content}
                </ReactMarkdown>
            </article>
        </main>
    );
}
