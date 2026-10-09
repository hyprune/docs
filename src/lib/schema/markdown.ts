import { createMarkdownProcessor } from '@astrojs/markdown-remark';

const processor = await createMarkdownProcessor();
/** Render trusted repository markdown (schema changelog) to HTML. */
export async function markdown(md: string) {
  return (await processor.render(md)).code;
}
