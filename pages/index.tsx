/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/exhaustive-deps */
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
import { createClient } from '@supabase/supabase-js';
import * as openai from 'openai';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
import { Octokit } from 'octokit';

export default function Home() {
  const octokit = new Octokit({
    auth: process.env.GITHUB_API_KEY,
  });
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
    const api_key = process.env.GITHUB_API_KEY;

    try {
      // Helper function to fetch data and handle 404 errors
      async function fetchData(url: string) {
        try {
          return await octokit.request(url, {
            owner: repoOwner,
            repo: repoName,
          });
        } catch (error: any) {
          if (error.status === 404) {
            console.log(`Error 404: ${url} not found.`);
            return null;
          } else {
            throw error;
          }
        }
      }

      // Fetch repository information
      const metaResponse = await fetchData('GET /repos/{owner}/{repo}');
      if (!metaResponse?.data) {
        return;
      }
      const eventsResponse = await fetchData(
        'GET /repos/{owner}/{repo}/events/',
      );
      const branchesResponse = await fetchData(
        'GET /repos/{owner}/{repo}/branches/',
      );
      const issuesResponse = await fetchData(
        'GET /repos/{owner}/{repo}/issues/',
      );
      const pullsResponse = await fetchData('GET /repos/{owner}/{repo}/pulls/');
      const commitsResponse = await fetchData(
        'GET /repos/{owner}/{repo}/commits',
      );
      const forksResponse = await fetchData('GET /repos/{owner}/{repo}/forks');

      // \\

      const repoInfo = (await metaResponse) as any;

      const metadata = (await commitsResponse) as any;

      const forks = (await forksResponse) as any;

      const events = (await eventsResponse) as any;

      const branches = (await branchesResponse) as any;

      const issues = (await issuesResponse) as any;

      const pulls = (await pullsResponse) as any;

      // \\

      // Iterate through URLs in the repoInfo
      const data: { [key: string]: any } = {};
      const urlRegex =
        /https:\/\/api\.github\.com\/repos\/[^\/]+\/[^\/]+\/[^/]+/;
      for (const key in metaResponse.data) {
        if (
          typeof repoInfo[key] === 'string' &&
          repoInfo[key].match(urlRegex)
        ) {
          const response = await fetch(repoInfo[key], {
            headers: { Authorization: `${api_key}` },
          });
          data[key] = await response.json().catch((error) => {
            console.error(`Error fetching ${key}:`, error);
          });
        }
      }

      // Iterate through URLs in the metadata
      for (const key in commitsResponse!.data) {
        if (
          typeof metadata[key] === 'string' &&
          metadata[key].match(urlRegex)
        ) {
          const response = await fetch(metadata[key], {
            headers: { Authorization: `${api_key}` },
          });
          metadata[key] = await response.json().catch((error) => {
            console.error(`Error fetching ${key}:`, error);
          });
        }
      }

      // Iterate through URLs in the forks
      for (const key in forksResponse!.data) {
        if (typeof forks[key] === 'string' && forks[key].match(urlRegex)) {
          const response = await fetch(forks[key], {
            headers: { Authorization: `${api_key}` },
          });
          forks[key] = await response.json().catch((error) => {
            console.error(`Error fetching ${key}:`, error);
          });
        }
      }

      // Download a repo as a zip file
      const zipUrl = `https://github.com/${repoOwner}/${repoName}/zipball/master/`;

      // Fetch and load repo using axios get using the api endpoint we created
      const response2 = await axios.get(
        `/api/download?url=${encodeURIComponent(zipUrl)}`,
        {
          responseType: 'arraybuffer',
        },
      );

      const repoData = response2.data;
      const zip = await JSZip.loadAsync(repoData);

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

        // Flatten the file hierarchy by getting only the file name without the folders
        const baseFilename = filename.split('/').pop();

        // Add cleanedContent to the new zip as a .txt file, in the root directory of the zip
        newTextZip.file(`${baseFilename}.txt`, content);
      });

      await Promise.all(filePromises);

      // Convert repoInfo to text and add it to the newTextZip as a file named 'repo_info.txt'
      const text = JSON.stringify(repoInfo, null, 2);
      newTextZip.file('repo_info.txt', text);

      // Convert metadata to text and add it to the newTextZip as a file named 'metadata.txt'
      const metadataText = JSON.stringify(metadata, null, 2);
      newTextZip.file('commits.txt', metadataText);

      // Convert forks to text and add it to the newTextZip as a file named 'forks.txt'
      const forksText = JSON.stringify(forks, null, 2);
      newTextZip.file('forks.txt', forksText);

      // Convert data to text and add it to the newTextZip as separate files named '<key>_data.txt', e.g., 'forks_data.txt'
      const dataText = JSON.stringify(data, null, 2);
      newTextZip.file('data.txt', dataText);

      // Convert events to text and add it to the newTextZip as a file named 'events.txt'
      const eventsText = JSON.stringify(events, null, 2);
      newTextZip.file('events.txt', eventsText);

      // Convert branches to text and add it to the newTextZip as a file named 'branches.txt'
      const branchesText = JSON.stringify(branches, null, 2);
      newTextZip.file('branches.txt', branchesText);

      // Convert issues to text and add it to the newTextZip as a file named 'issues.txt'
      const issuesText = JSON.stringify(issues, null, 2);
      newTextZip.file('issues.txt', issuesText);

      // Convert pulls to text and add it to the newTextZip as a file named 'pulls.txt'
      const pullsText = JSON.stringify(pulls, null, 2);
      newTextZip.file('pulls.txt', pullsText);

      for (const key in data) {
        // Store each response as a separate txt file named '<key>_data.txt', e.g., 'forks_data.txt'
        const textKey = JSON.stringify(data[key], null, 2);
        newTextZip.file(`${key}_data.txt`, textKey);
      }

      // Generate and save the zip file with text files and repoInfo
      const newTextZipBlob = await newTextZip.generateAsync({ type: 'blob' });
      saveAs(newTextZipBlob, `${repoName}-textfiles.zip`);
    } catch (error) {
      console.error('Error:', error);
    }

    const configuration = new Configuration({
      organization: 'org-0kv1BZemqKjx2ZYE3QI80FAX',
      apiKey: process.env.OPENAI_API_KEY,
    });
    const openai = new OpenAIApi(configuration);
    async function loadRandomQuestion() {
      try {
        const response = await openai.createCompletion({
          model: 'text-davinci-003',
          prompt:
            'Act as a person asking questions about a github repo, like how many forks does it have, etc. Make a random question about the repo.',
          max_tokens: 1,
          temperature: 0.2,
        });
        console.log(response.data);
        const question = response.data.choices[0].text;
        if (question) {
          const inputElement = document.getElementById(
            'userInput',
          ) as HTMLInputElement;
          if (inputElement) {
            inputElement.placeholder = question.trim() + ' [TAB] to fill in';
          }
        }
      } catch (error) {
        console.error('Error fetching a random question:', error);
      }
    }
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
  const handleTab = (e: any) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setQuery(e.target.getAttribute('placeholder'));
    }
  };

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

  const questions = [
    'What are the last 3 commits?',
    'Who are the top contributors to this repo?',
    'What is the most recent issue created?',
    'How many forks does this repo have?',
    'What is the primary programming language used in this repo?',
    'What is the description of this repo?',
    'What is the most recent pull request?',
    'What is the repos license?',
    'How many branches does this repo have?',
    'What is the total number of commits in this repo?',
    'What is the repos creation date?',
    'What is the repos last update date?',
    'What is the repos clone URL?',
    'What is the repos homepage URL?',
    'What is the repos owner username?',
    'What is the repos owner email?',
    'What is the code about?',
  ];
  function getRandomQuestion() {
    return questions[Math.floor(Math.random() * questions.length)];
  }
  const [placeholder, setPlaceholder] = useState(getRandomQuestion());
  useEffect(() => {
    setPlaceholder(getRandomQuestion());
  }, [loading]);

  const SwitchButton = () => {
    const [isOn, setIsOn] = useState(false);

    const handleClick = () => {
      setIsOn(!isOn);
    };

    const containerStyle: React.CSSProperties = {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    };

    const buttonStyle: React.CSSProperties = {
      width: '66px',
      height: '34px',
      borderRadius: '17px',
      backgroundColor: isOn ? '#4CCBD9' : '#3191DB',
      position: 'relative',
      transition: 'background-color 0.3s',
      cursor: 'pointer',
    };

    const innerCircleStyle: React.CSSProperties = {
      position: 'absolute',
      top: '3px',
      left: isOn ? '35px' : '3px',
      width: '28px',
      height: '28px',
      borderRadius: '14px',
      backgroundColor: '#FFFFFFF9',
      transition: 'left 0.2s',
    };

    const labelStyle: React.CSSProperties = {
      marginTop: '8px',
      textAlign: 'center',
      color: '#3B3B3B',
      fontWeight: 'bold',
    };

    return (
      <div style={containerStyle}>
        <div style={buttonStyle} onClick={handleClick}>
          <div style={innerCircleStyle}></div>
        </div>
        <div style={labelStyle}>
          {isOn ? 'Chat about Code' : 'Chat about GitHub Repo Data'}
        </div>
      </div>
    );
  };

  return (
    <>
      <Layout>
        <div className="mx-auto flex flex-col gap-4">
          <h1 className="text-2xl font-bold leading-[1.1] tracking-tighter text-center">
            Chat With GitHub Repo
          </h1>
          <div className="m-auto p-1">
            <a href="https://twitter.com/saleemusama">Research Experiment</a>
          </div>

          {/* input box to paste a URL with a button beside that says "Process" */}
          <div
            className="flex items-center "
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              marginLeft: '40px',
              marginRight: '40px',
              alignContent: 'center',
              justifyContent: 'center',
            }}
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
              </div>
            </form>
            <div>
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
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignContent: 'center',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <SwitchButton />
          </div>

          <main className={styles.main}>
            <div className={styles.cloud}>
              <div ref={messageListRef} className={styles.messagelist}>
                {messages.map((message, index) => {
                  <div key={`chatMessage-${index}`}></div>;
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
                  <div style={{ display: 'flex' }}>
                    <textarea
                      disabled={loading}
                      onKeyDown={handleTab} // Add this line
                      // on enter, submit form
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                      ref={textAreaRef}
                      autoFocus={false}
                      rows={1}
                      maxLength={512}
                      id="userInput"
                      name="userInput"
                      placeholder={
                        loading ? 'Waiting for response...' : placeholder
                      }
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className={styles.textarea}
                    />
                  </div>

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
          <a href="https://twitter.com/saleemusama">
            <img
              src="https://img.icons8.com/?size=512&id=5MQ0gPAYYx7a&format=png"
              alt="Twitter"
              width="35px"
              style={{
                paddingBottom: '4em',
              }}
            />
          </a>
        </footer>
      </Layout>
    </>
  );
}
