語言規則：所有面向讀者的標題、摘要、推薦理由、譯文、報告與說明均使用台灣繁體中文；使用台灣常用詞。JSON 欄位名稱、程式碼、網址、品牌專名，以及要求逐字引用的原文證據維持原樣。


【AI 領域翻譯規則 — 本平台 100% 是 AI/ML/LLM 行業內容，嚴格遵守】

1. 歧義預設值：以下詞在中文有非 AI 歧義，**一律按 AI 含義翻譯**：
   - LLM = 大語言模型（絕不譯"法學碩士"/"Master of Laws"）
   - Token / tokens = 模型 token（保留英文；絕不譯"代幣"/"令牌"）
   - Transformer = Transformer 架構（保留英文；不譯"變壓器"）
   - Diffusion = 擴散模型（AI 生成，不是物理擴散）
   - Agent / Agentic = AI 智慧體 / 智慧體的（不譯"代理人"/"中介"）
   - Alignment = 對齊（AI 安全語境）
   - Inference = 推理（模型生成）
   - Reasoning = 推理（注意：與 inference 都譯"推理"，必要時用"鏈式推理"區分 CoT；reasoning model 指 o1/o3/R1 這類思考型模型）
   - Embedding = 嵌入向量（也可保留英文）
   - Distillation = 知識蒸餾
   - Hallucination = 模型幻覺
   - Fine-tune / Fine-tuning = 微調
   - Pretrain / Pretraining = 預訓練
   - Context window = 上下文視窗
   - Prompt = 提示詞
   - Skill / Skills = 技能（Claude 等 Agent 框架的能力包，不譯"特長"）

2. 以下專有名詞**一律保留英文原文**，不翻譯不加中文括注：
   - AI 公司：OpenAI / Anthropic / Google DeepMind / xAI / Meta AI / Mistral / DeepSeek / Cohere / HuggingFace（HF）/ Runway / ElevenLabs / Suno / Pika / Midjourney / Perplexity
   - 模型族（舉例 + 通用規則）：GPT / Claude / Gemini / Llama / Qwen / Grok / o 系列 / DeepSeek / Mistral / Mixtral / Phi / Sora / Veo / Imagen
     **規則**：任何大模型族名、產品代號一律保留英文
   - 模型版本號（舉例 + 通用規則）：GPT-5 / Claude 4.7 / Claude Sonnet 4.6 / Llama 4 / Gemini 3 / o3 / o4 / DeepSeek-V4 / Qwen3.7
     **規則**：版本號一字不改（包括字母數字字尾如 4o / 4.7 / 405B / V4 / R1），絕不"翻譯性擴寫"（不要把 "405B" 譯成 "4050 億"，不要把 "V4" 譯成 "第 4 代"）
   - 技術縮寫（舉例 + 通用規則）：LLM / RAG / RLHF / DPO / LoRA / QLoRA / PEFT / MoE / CoT / ReAct / KV cache / SOTA / AGI / MCP / ADK / NPU / GPU / TPU
     **規則**：任何 2-5 字母的全大寫縮寫，預設按 AI/ML 含義保留英文
   - 評測基準（舉例 + 通用規則）：MMLU / GPQA / HumanEval / SWE-bench / SWE-bench Verified / AIME / HLE / ARC-AGI / ARC-AGI 2 / MT-Bench / Chatbot Arena / Aider Polyglot / LiveCodeBench
     **規則**：以 -bench / -eval 結尾或全大寫的評測名一律保留英文
   - AI 工具/產品：Cursor / Copilot / Codex / Aider / Devin / Cline / Claude Code / Windsurf / Zed / v0 / Bolt / Lovable / Replit Agent
   - Agent 框架：LangChain / LangGraph / LlamaIndex / CrewAI / AutoGen / Pydantic AI / Vercel AI SDK / DSPy
   - 推理/部署：Ollama / vLLM / SGLang / TensorRT / Triton / CUDA / ROCm
   - 通用技術：API / SDK / CLI / IDE / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中國廠商**優先用官方中文品牌名**（首次出現可雙標"千問（Qwen3）"，後續選一種保持一致）：
   - 千問（Qwen）/ 文心一言 / 智譜（GLM）/ 月之暗面（Kimi）/ 深度求索（DeepSeek）/ 階躍星辰（Step）/ 零一萬物（Yi）/ 百川 / 豆包（位元組）/ 混元（騰訊）/ 可靈（Kling，快手）/ 即夢（Jimeng，位元組）/ MiniMax（不譯）/ 美團 LongCat / 崑崙萬維 Skywork / 面壁 MiniCPM / 華為昇騰 / 寒武紀

4. 程式碼 / 命令 / URL / 數字單位 **一字不改**保留：
   - 反引號程式碼 `code` 不翻譯
   - 命令如 /code-review、pip install、npm run 不譯（不要譯"程式碼審查"）
   - URL 原樣
   - 數字+單位：8k context / 175B params / 3.5x speedup / $3 per M tokens / 99.9%
   - 金額、引數量、比例、區間必須保留原文的阿拉伯數字和單位；不要把 $10B-$100B 改寫成“數百億至數千億美元”等中文數量詞
