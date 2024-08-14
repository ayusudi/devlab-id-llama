import fs from "fs";
import http from "http";

const LLM_API_BASE_URL =
    process.env.LLM_API_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_API_KEY =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "gsk_yourgroqapikeyhere";
const LLM_CHAT_MODEL = process.env.LLM_CHAT_MODEL;
const LLM_STREAMING = process.env.LLM_STREAMING !== "no";

const chat = async (messages, handler) => {
    const url = `${LLM_API_BASE_URL}/chat/completions`;
    const auth = LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {};
    const model = LLM_CHAT_MODEL || "llama-3.1-8b-instant";
    const max_tokens = 400;
    const stream = LLM_STREAMING && typeof handler === "function";
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify({
            messages,
            model,
            max_tokens,
            temperature: 0,
            top_p: 0.9,
            stream
        }),
    });
    if (!response.ok) {
        throw new Error(
            `HTTP error with the status: ${response.status} ${response.statusText}`,
        );
    }

    if (!stream) {
        const data = await response.json();
        const { choices } = data;
        const first = choices[0];
        const { message } = first;
        const { content } = message;
        const answer = content.trim();
        handler && handler(answer);
        return answer;
    }

    const parse = (line) => {
        let partial = null;
        const prefix = line.substring(0, 6);
        if (prefix === "data: ") {
            const payload = line.substring(6);
            try {
                const { choices } = JSON.parse(payload);
                const [choice] = choices;
                const { delta } = choice;
                partial = delta?.content;
            } catch (e) {
                // ignore
            } finally {
                return partial;
            }
        }
        return partial;
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let answer = "";
    let buffer = "";
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        const lines = decoder.decode(value).split("\n");
        for (let i = 0; i < lines.length; ++i) {
            const line = buffer + lines[i];
            if (line[0] === ":") {
                buffer = "";
                continue;
            }
            if (line === "data: [DONE]") {
                break;
            }
            if (line.length > 0) {
                const partial = parse(line);
                if (partial === null) {
                    buffer = line;
                } else if (partial && partial.length > 0) {
                    buffer = "";
                    if (answer.length < 1) {
                        const leading = partial.trim();
                        answer = leading;
                        handler && leading.length > 0 && handler(leading);
                    } else {
                        answer += partial;
                        handler && handler(partial);
                    }
                }
            }
        }
    }
    return answer;
};

const REPLY_PROMPT = `
You're assistant and provide the answer only. 
Example : 
Q: I have 1000 rupiah and my brother have 2000 rupiah. How much many we have?
A: 3000 rupiah

Q : Roger has 5 tennis balls. He buys 2 more cans of tennis balls. Each cans has 3 tennis balls. How many tennis balls does he have now?
A : 11 tennis balls

Q : In cafetaria had 20 apples and they use 15 apples at lunch. How many apple left? 
A : 5 apples

Let's go!
`;

const reply = async (context) => {
    const { inquiry, history, stream } = context;

    const messages = [];
    messages.push({ role: "system", content: REPLY_PROMPT });
    const relevant = history.slice(-4);
    relevant.forEach((msg) => {
        const { inquiry, answer } = msg;
        messages.push({ role: "user", content: inquiry });
        messages.push({ role: "assistant", content: answer });
    });
    messages.push({ role: "user", content: inquiry });
    const answer = await chat(messages, stream);

    return { answer, ...context };
};

(async () => {
    if (!LLM_API_BASE_URL) {
        console.error("Fatal error: LLM_API_BASE_URL is not set!");
        process.exit(-1);
    }
    console.log(
        `Using LLM at ${LLM_API_BASE_URL} (model: ${LLM_CHAT_MODEL || "default"}).`,
    );

    const history = [];

    const server = http.createServer(async (request, response) => {
        const { url } = request;
        if (url === "/health") {
            response.writeHead(200).end("OK");
        } else if (url === "/" || url === "/index.html") {
            response.writeHead(200, { "Content-Type": "text/html" });
            response.end(fs.readFileSync("./index.html"));
        } else if (url.startsWith("/chat")) {
            const parsedUrl = new URL(`http://localhost/${url}`);
            const { search } = parsedUrl;
            const inquiry = decodeURIComponent(search.substring(1));
            console.log("    Human:", inquiry);
            response.writeHead(200, { "Content-Type": "text/plain" });

            const stream = (part) => response.write(part);
            const context = { inquiry, history, stream };
            const start = Date.now();
            const result = await reply(context);
            const duration = Date.now() - start;
            response.end();

            const { answer } = result;
            console.log("Assistant:", answer);
            console.log("       (in", duration, "ms)");
            console.log();
            history.push({ inquiry, answer, duration });
        } else {
            console.error(`${url} is 404!`);
            response.writeHead(404);
            response.end();
        }
    });

    const port = process.env.PORT || 3000;
    server.listen(port);
    console.log("Listening on port", port);
})();