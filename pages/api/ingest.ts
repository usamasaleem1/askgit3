/* eslint-disable import/no-anonymous-default-export */
import { exec } from 'child_process';
import type { NextApiRequest, NextApiResponse } from 'next';

export default (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    exec('npm run ingest', (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        res.status(500).json({ message: 'Error running ingest script' });
        return;
      }
      res.status(200).json({ message: 'Ingest script ran successfully', stdout, stderr });
    });
  } else {
    res.status(405).json({ message: 'Method not supported' });
  }
};