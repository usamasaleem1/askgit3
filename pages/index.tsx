import { useRef, useState, useEffect } from 'react';
import Layout from '@/components/layout';
import styles from '@/styles/Home.module.css';
import { Message } from '@/types/chat';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import LoadingDots from '@/components/ui/LoadingDots';
import { Document } from 'langchain/document';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import axios from 'axios';

export default function Home() {
  const [processing, setProcessing] = useState(false);
  const [query, setQuery] = useState<string>('');
  const [URLQuery, setURLQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{
    messages: Message[];
    pending?: string;
    history: [string, string][];
    pendingSourceDocs?: Document[];
  }>({
    messages: [
      {
        message: 'Hi, what would you like to learn about this repo?',
        type: 'apiMessage',
      },
    ],
    history: [],
  });

  const { messages, history } = messageState;
  const messageListRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textAreaRef.current?.focus();
  }, []);

  //ingest the pdfs
  async function runIngestScript() {
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error('Error running ingest script');
      }

      const { message } = await response.json();
      console.log(message);
    } catch (error) {
      console.error(error);
    }
  }

  async function downloadFiles(repoOwner: string, repoName: string) {
    // Fetch repository information
    const response = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}`,
    );
    const repoInfo = await response.json();

    // Download a repo as a zip file
    const zipUrl = `https://github.com/${repoOwner}/${repoName}/archive/refs/heads/main.zip`;
    // Fetch and load repo using axios get using the api endpoint we created
    const response2 = await axios.get(
      `/api/download?url=${encodeURIComponent(zipUrl)}`,
      { responseType: 'arraybuffer' },
    );
    const data = response2.data;

    const zip = await JSZip.loadAsync(data);

    // Extract necessary files, convert them to text files, and add them to a new zip without the folder structure
    const newTextZip = new JSZip();
    const filePromises = Object.keys(zip.files).map(async (filename) => {
      // Skip folders
      if (zip.files[filename].dir) return;
      // skip images
      if (filename.match(/\.(jpg|jpeg|png|gif|ico|svg)$/)) return;
      // skip package-lock.json
      if (filename.match(/package-lock.json$/)) return;

      const content = await zip.files[filename].async('string');

      // Remove any characters not in the WinAnsi encoding range and replace them with spaces
      // const cleanedContent = content.replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');

      // Flatten the file hierarchy by getting only the file name without the folders
      const baseFilename = filename.split('/').pop();

      // Add cleanedContent to the new zip as a .txt file, in the root directory of the zip
      newTextZip.file(`${baseFilename}.txt`, content);
    });

    await Promise.all(filePromises);

    // Convert repoInfo to text and add it to the newTextZip as a file named 'repo_info.txt'
    const text = JSON.stringify(repoInfo, null, 2);
    newTextZip.file('repo_info.txt', text);

    // Generate and save the zip file with text files and repoInfo
    const newTextZipBlob = await newTextZip.generateAsync({ type: 'blob' });
    saveAs(newTextZipBlob, `${repoName}-textfiles.zip`);
  }

  // handle github URL
  async function handleGithubURL(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (!URLQuery) {
      alert('Please input a URL');
      return;
    }

    // check if URL is valid
    const url = URLQuery.trim();
    const urlRegex = new RegExp(
      '^(https?://)?(www.)?github.com/([a-zA-Z0-9-]+/[a-zA-Z0-9-]+)$',
    );
    if (!urlRegex.test(url)) {
      alert('Please input a valid GitHub URL');
      return;
    }

    const match = urlRegex.exec(url);
    if (match && match[3]) {
      const repo = match[3];

      // Call downloadFiles with the repo owner and repo name
      const [repoOwner, repoName] = repo.split('/');
      console.log(repoOwner, repoName);
      setProcessing(true); // Set processing state to true
      try {
        await downloadFiles(repoOwner, repoName);
        setProcessing(false); // Set processing state to false after downloadFiles is done
      } catch (error) {
        setProcessing(false);
        alert('An error occurred while processing the repository.');
        console.log('error: ' + error);
      }
    } else {
      alert('An error occurred while processing the URL');
    }
  }

  //handle form submission
  async function handleSubmit(e: any) {
    e.preventDefault();

    setError(null);

    if (!query) {
      alert('Please input a question');
      return;
    }

    const question = query.trim();

    setMessageState((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          type: 'userMessage',
          message: question,
        },
      ],
    }));

    setLoading(true);
    setQuery('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question,
          history,
        }),
      });
      const data = await response.json();
      console.log('data', data);

      if (data.error) {
        setError(data.error);
      } else {
        setMessageState((state) => ({
          ...state,
          messages: [
            ...state.messages,
            {
              type: 'apiMessage',
              message: data.text,
              sourceDocs: data.sourceDocuments,
            },
          ],
          history: [...state.history, [question, data.text]],
        }));
      }
      console.log('messageState', messageState);

      setLoading(false);

      //scroll to bottom
      messageListRef.current?.scrollTo(0, messageListRef.current.scrollHeight);
    } catch (error) {
      setLoading(false);
      setError('An error occurred while fetching the data. Please try again.');
      console.log('error', error);
    }
  }

  //prevent empty submissions
  const handleEnter = (e: any) => {
    if (e.key === 'Enter' && query) {
      handleSubmit(e);
    } else if (e.key == 'Enter') {
      e.preventDefault();
    }
  };

  const handleURL = (e: any) => {
    if (e.key === 'Enter' && URLQuery) {
      handleGithubURL(e);
    } else if (e.key == 'Enter') {
      e.preventDefault();
    }
  };

  return (
    <>
      <Layout>
        <div className="mx-auto flex flex-col gap-4">
          <h1 className="text-2xl font-bold leading-[1.1] tracking-tighter text-center">
            Chat With GitHub Repo
          </h1>
          <div className="m-auto p-1">
            <a href="https://twitter.com/saleemusama">by Usama</a>
          </div>

          {/* input box to paste a URL with a button beside that says "Process" */}
          <div
            className="flex items-center justify-center"
            style={
              {
                // margin: '1rem',
              }
            }
          >
            <form
              className="flex flex-col items-center justify-center"
              onSubmit={handleGithubURL}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignContent: 'center',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <textarea
                  // ref={textAreaRef}
                  // className="w-full border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter URL here"
                  value={URLQuery}
                  onChange={(e) => setURLQuery(e.target.value)}
                  onKeyDown={handleURL}
                  style={{
                    width: '300px',
                    height: '3rem',
                    border: '1px solid #D1D5DB',
                    borderRadius: '2rem',
                    padding: '0.75rem 1rem',
                    resize: 'none',
                    outline: 'none',
                    boxShadow: '#0000001A 0px 4px 12px',
                    // hide scrollbar
                    overflow: 'hidden',
                  }}
                />{' '}
                {processing ? (
                  <div
                    style={{
                      backgroundColor: '#2564EB00',
                      marginLeft: '1rem',
                    }}
                  >
                    <LoadingDots color="#050C1AEF" />
                  </div>
                ) : (
                  <button
                    type="submit"
                    style={{
                      marginLeft: '1rem',
                      padding: '0.5rem 1.5rem',
                      // backgroundColor: '#2563EB',
                      //gradient background
                      backgroundImage:
                        'linear-gradient(180deg, #0FB6C5 0%, #3191DB 100%)',
                      color: '#FFFFFF',
                      borderRadius: '2rem',
                      boxShadow: '#0000001A 0px 4px 12px',
                      height: '50%',
                      alignContent: 'center',
                      borderWidth: '3px',
                      borderColor: '#FFFFFF70',
                    }}
                    disabled={processing} // Disable the button while processing
                  >
                    Process
                  </button>
                )}
              </div>
            </form>
            <button
              type="submit"
              style={{
                margin: '1rem',
                padding: '0.5rem 1.5rem',
                backgroundImage:
                  'linear-gradient(180deg, #0FB6C5 0%, #3191DB 100%)',
                color: '#FFFFFF',
                borderRadius: '2rem',
                boxShadow: '#0000001A 0px 4px 12px',
                height: '50%',
                alignContent: 'center',
                borderWidth: '3px',
                borderColor: '#FFFFFF70',
              }}
              // run ingest function
              onClick={runIngestScript}
            >
              Ingest
            </button>
          </div>

          <main className={styles.main}>
            <div className={styles.cloud}>
              <div ref={messageListRef} className={styles.messagelist}>
                {messages.map((message, index) => {
                  let icon;
                  let className;
                  if (message.type === 'apiMessage') {
                    icon = (
                      <Image
                        key={index}
                        src="/bot-image.png"
                        alt="AI"
                        width="40"
                        height="40"
                        className={styles.boticon}
                        priority
                      />
                    );
                    className = styles.apimessage;
                  } else {
                    icon = (
                      <Image
                        key={index}
                        src="/usericon.png"
                        alt="Me"
                        width="30"
                        height="30"
                        className={styles.usericon}
                        priority
                      />
                    );
                    // The latest message sent by the user will be animated while waiting for a response
                    className =
                      loading && index === messages.length - 1
                        ? styles.usermessagewaiting
                        : styles.usermessage;
                  }
                  return (
                    <>
                      <div key={`chatMessage-${index}`} className={className}>
                        {icon}
                        <div className={styles.markdownanswer}>
                          <ReactMarkdown linkTarget="_blank">
                            {message.message}
                          </ReactMarkdown>
                        </div>
                      </div>
                      {message.sourceDocs && (
                        <div
                          className="p-5"
                          key={`sourceDocsAccordion-${index}`}
                        >
                          <Accordion
                            type="single"
                            collapsible
                            className="flex-col"
                          >
                            {message.sourceDocs.map((doc, index) => (
                              <div key={`messageSourceDocs-${index}`}>
                                <AccordionItem value={`item-${index}`}>
                                  <AccordionTrigger>
                                    <h3>Source {index + 1}</h3>
                                  </AccordionTrigger>
                                  <AccordionContent>
                                    <ReactMarkdown linkTarget="_blank">
                                      {doc.pageContent}
                                    </ReactMarkdown>
                                    <p className="mt-2">
                                      <b>Source:</b> {doc.metadata.source}
                                    </p>
                                  </AccordionContent>
                                </AccordionItem>
                              </div>
                            ))}
                          </Accordion>
                        </div>
                      )}
                    </>
                  );
                })}
              </div>
            </div>
            <div className={styles.center}>
              <div className={styles.cloudform}>
                <form onSubmit={handleSubmit}>
                  <textarea
                    disabled={loading}
                    onKeyDown={handleEnter}
                    ref={textAreaRef}
                    autoFocus={false}
                    rows={1}
                    maxLength={512}
                    id="userInput"
                    name="userInput"
                    placeholder={
                      loading
                        ? 'Waiting for response...'
                        : 'When was it last updated?'
                    }
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={styles.textarea}
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className={styles.generatebutton}
                  >
                    {loading ? (
                      <div className={styles.loadingwheel}>
                        <LoadingDots color="#000" />
                      </div>
                    ) : (
                      // Send icon SVG in input field
                      <svg
                        viewBox="0 0 20 20"
                        className={styles.svgicon}
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z"></path>
                      </svg>
                    )}
                  </button>
                </form>
              </div>
            </div>
            {error && (
              <div className="border border-red-400 rounded-md p-4">
                <p className="text-red-500">{error}</p>
              </div>
            )}
          </main>
        </div>
        <footer className="m-auto p-4">
          <a href="https://twitter.com/saleemusama">Twittah</a>
        </footer>
      </Layout>
    </>
  );
}
