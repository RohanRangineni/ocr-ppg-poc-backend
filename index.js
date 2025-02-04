require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error("❌ OpenAI API key is missing. Please set OPENAI_API_KEY in .env file.");
    process.exit(1);
}

console.log("✅ OpenAI API Key Loaded");

// Configure multer for file uploads
app.post("/upload-image", upload.single("image"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    console.log("Uploaded file details:", req.file);
    const fileExtension = req.file.mimetype.split("/")[1];
    const newFilePath = `${req.file.path}.${fileExtension}`;
    fs.renameSync(req.file.path, newFilePath);

    try {
        const formData = new FormData();
        formData.append("file", fs.createReadStream(newFilePath));
        formData.append("purpose", "vision");

        const response = await axios.post("https://api.openai.com/v1/files", formData, {
            headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                ...formData.getHeaders(),
            },
        });

        fs.unlink(newFilePath, (err) => {
            if (err) console.error("Failed to delete file:", err);
        });

        res.json({ file_id: response.data.id });
    } catch (error) {
        console.error("Upload error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data : error.message });
    }
});

// 🔹 Create Thread
app.post("/create-thread", async (req, res) => {
    const { file_id } = req.body;
    if (!file_id) return res.status(400).json({ error: "file_id is required" });

    try {
        const fileCheck = await axios.get(`https://api.openai.com/v1/files/${file_id}`, {
            headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
        });

        if (fileCheck.data.status !== "processed") {
            return res.status(400).json({ error: "File is not fully processed yet. Try again later." });
        }

        const response = await axios.post(
            "https://api.openai.com/v1/threads",
            {
                messages: [{
                    role: "user",
                    content: [{
                        type: "image_file",
                        image_file: { "file_id": file_id }
                    }]
                }],
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                }
            }
        );

        res.json(response.data);
    } catch (error) {
        console.error("Thread creation error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: error.response ? error.response.data : error.message });
    }
});

// 🔹 Run Thread with Assistant
app.post("/run-thread", async (req, res) => {
    try {
        const response = await axios.post(
            `https://api.openai.com/v1/threads/${req.body.thread_id}/runs`,
            { assistant_id: "asst_GsJMD1ZEl1dFgRmHX8NprbBj" },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.response ? error.response.data : error.message });
    }
});

// 🔹 Fetch Messages from Thread
app.get("/get-messages/:thread_id", async (req, res) => {
    try {
        const response = await axios.get(
            `https://api.openai.com/v1/threads/${req.params.thread_id}/messages`,
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": "assistants=v2"
                },
            }
        );

        const assistantResponse = response.data.data.find(msg => msg.role === 'assistant');
        if (assistantResponse) {
            res.json(assistantResponse);
        } else {
            res.status(404).json({ error: "No assistant response found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.response ? error.response.data : error.message });
    }
});

app.listen(5001, () => console.log("🚀 Server running on port 5001"));
