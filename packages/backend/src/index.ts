import express, { Request, Response } from 'express';
import { db } from './lib/prisma.js';
import path from 'path';

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());

const frontendDistPath = path.join(process.cwd(), 'build', 'public');

app.use(express.static(frontendDistPath));

app.post('/api/data', async (req: Request, res: Response): Promise<void> => {
    try {
        const payloadData = req.body;

        if (!payloadData || Object.keys(payloadData).length === 0) {
            res.status(400).json({ error: 'Request body cannot be empty' });
            return;
        }

        const savedRecord = await db.record.create({
            data: {
                payload: JSON.stringify(payloadData),
            },
        });

        if (savedRecord)
            res.status(201).json({
                message: 'Data successfully saved to database'
            });

    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Database insertion error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Express server is running on http://localhost:${PORT}`);
});