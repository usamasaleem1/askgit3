/* eslint-disable import/no-anonymous-default-export */
import axios from 'axios';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const { url } = req.query;

    try {
      const response = await axios.get(url as string, {
        responseType: 'arraybuffer',
        headers: {
          'Content-Type': 'application/zip',
        },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.send(response.data);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching repository zip file' });
    }
  } else {
    res.status(405).json({ message: 'Method not supported' });
  }
};