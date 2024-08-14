# Nano Jarvis

![Screenshot](nano-jarvis.png)

Nano Jarvis is compatible with either a cloud-based (managed) LLM service (e.g. [OpenAI GPT model](https://platform.openai.com/docs), [Grog](https://groq.com), [OpenRouter](https://openrouter.ai), etc) or with a locally hosted LLM server (e.g. [llama.cpp](https://github.com/ggerganov/llama.cpp), [LocalAI](https://localai.io), [Ollama](https://ollama.com), etc). Please continue reading for detailed instructions.

Requirement: [Node.js](https://nodejs.org) v18 or later.

Launch with:

```
npm start
```
then open `localhost:3000` with your favorite web browser.

## Using Local LLM Servers

Supported local LLM servers include [llama.cpp](https://github.com/ggerganov/llama.cpp), [Jan](https://jan.ai), [Ollama](https://ollama.com), and [LocalAI](https://localai.io).

To use [Ollama](https://ollama.com) locally, load a model and configure the environment variable `LLM_API_BASE_URL`:
```bash
ollama pull llama3.1
export LLM_API_BASE_URL=http://127.0.0.1:11434/v1
export LLM_CHAT_MODEL='llama3.1'
```

## Using Managed LLM Services

To use [Groq](https://groq.com/), select a model (e.g. [LLaMa-3.1-8B](https://console.groq.com/docs/models#llama-31-8b-preview), [LLaMa3-8B](https://console.groq.com/docs/models#meta-llama-3-8b), etc) and set the environment variables accordingly.

```bash
export LLM_API_BASE_URL=https://openrouter.ai/api/v1
export LLM_API_KEY="yourownapikey"
export LLM_CHAT_MODEL="meta-llama/llama-3-8b-instruct"
```

## Prompt Example

- Can you speak Bahasa Indonesia?
- When your training data cutoff?

## References

This project is fork of this original [nano-jarvis](https://github.com/ariya/nano-jarvis) project created by [Ariya Hidayat](https://github.com/ariya) and modified so it's suitable for this workshop.
![Screenshot](nano-jarvis.png)
