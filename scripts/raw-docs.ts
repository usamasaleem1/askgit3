import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';
import { PineconeStore } from 'langchain/vectorstores/pinecone';
import { pinecone } from '@/utils/pinecone-client';
import { PINECONE_INDEX_NAME, PINECONE_NAME_SPACE } from '@/config/pinecone';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { CustomTextLoader } from '@/utils/customTextLoader';

/* Name of directory to retrieve your files from */
const filePath = 'docs';

export const run = async () => {
  
  /*load raw docs from the all files in the directory */
  // directory is in /docs folder
  const directoryLoader = new DirectoryLoader(filePath, {
    '.txt': (path) => new CustomTextLoader(path),
  });

  const rawDocs = await directoryLoader.load();
 

  // iteratively convert every single file in this directory, including in the sub directories, into individual text files (.txt)


  
};

(async () => {
  await run();
  console.log('ingestion complete');
})();
