import fs from "fs";
import http from "http";

const LLM_API_BASE_URL =
    process.env.LLM_API_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_API_KEY =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    "gsk_yourapikey";
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

const REPLY_PROMPT = `You run in a process of Question, Thought, Action, Observation.

Use Thought to describe your thoughts about the question you have been asked.
Observation will be the result of running those actions.
Finally at the end, state the Answer.

Example session:

Question:How much is $125 in IDR?
Thought: I need to find the exchange rate between USD and IDR
Action: get_exchange_rate: USD to IDR
PAUSE

You will called again with this:

Observation: 1 USD = 15000 IDR

Thought: I need to multiply this by 125
Action: calculate: 125 * 15000
PAUSE

You will be called again with this:

Observation: 125 * 15000 = 1875000

If you have the answer, output it as the Answer.

Answer: 125 USD is equal to 1,875,000 IDR.

Now it's your turn:`;

async function get_exchange_rate(from, to) {
    const url = `https://api.exchangerate-api.com/v4/latest/${from}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `HTTP error with the status: ${response.status} ${response.statusText}`,
        );
    }
    const data = await response.json();
    return data.rates[to];
}

const tools = ["calculate", "get_exchange_rate"];

const reply = async (context) => {
    const { inquiry, history, stream, attempt } = context;
    const tried = context.attempt || 0;
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
    let nextPrompt = "";
    if (answer.includes("PAUSE") && answer.includes("Action")) {
        const action = answer.split("Action:")[1].split("PAUSE")[0];
        const tool = action.split(":")[0].split(":")[0].trim();
        const args = action.split(":")[1].split("\n")[0].trim().split(" to ");
        if (tools.includes(tool)) {
            if (tool === "get_exchange_rate") {
                const from = args[0];
                const to = args[1];
                const rate = await get_exchange_rate(from, to);
                nextPrompt = `Observation: 1 ${from} = ${rate} ${to}`;
            } else if (tool === "calculate") {
                const expression = args[0];
                const result = calculate(expression);
                nextPrompt = `Observation: ${args[0]} = ${result}`;
            } else {
                nextPrompt = "Observation: tool not found";
            }
        }
        history.push({ inquiry, answer: nextPrompt });
        if (nextPrompt !== "" && tried < 4) {
            const response = await reply({
                inquiry: nextPrompt,
                history,
                stream,
                attempt: tried + 1,
            });
        }
    }
    if (answer.includes("Answer")) {
        return;
    }
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
