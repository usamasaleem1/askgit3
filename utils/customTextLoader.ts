import { Document } from 'langchain/document';
import { readFile } from 'fs/promises';
import { BaseDocumentLoader } from 'langchain/document_loaders';

export class CustomTextLoader extends BaseDocumentLoader {
  constructor(public filePath: string) {
    super();
  }

  public async load(): Promise<Document[]> {
    const content = await readFile(this.filePath, 'utf8');
    const metadata = { source: this.filePath };

    return [
      new Document({
        pageContent: content,
        metadata,
      }),
    ];
  }
}