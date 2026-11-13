# Project report outline (bachelor final-year project)

1. **Introduction**: problem: chat assistants over-generate, give users no control over reasoning depth,
   and waste tokens. Objective: an assistant that lets users steer *how* and *how far* the AI reasons.
2. **Literature review**
   - Chain-of-Thought prompting (Wei et al., 2022); Tree-of-Thoughts (Yao et al., 2023)
   - ReAct: reasoning + acting with tools (Yao et al., 2022)
   - Retrieval-Augmented Generation (Lewis et al., 2020)
   - Self-Refine / self-critique (Madaan et al., 2023)
   - LLM-as-a-judge (Zheng et al., 2023)
   - Text classification with TF-IDF and linear models; human-AI interaction and user control
3. **Requirements**: functional (paths, step selection, branching, RAG, tools, voice, export) and
   non-functional (free providers, offline mode, security, latency).
4. **System design**: see `architecture.md` (component diagram, pipeline sequence, data model, security).
5. **Implementation**
   - Multi-provider LLM router with fallback and usage logging
   - Question classifier (dataset, features, model selection)
   - Framework-based path generation, structured output validation, hybrid ranking
   - Conversation memory and the thinking-tree data model
   - RAG pipeline (chunking, embeddings, ChromaDB, citations) and agent tools
   - React UI (state management, streaming, visualisation)
6. **Testing**: unit tests (Vitest, pytest), CI pipeline, manual test cases.
7. **Evaluation**: classifier metrics, token savings, path quality, latency (cloud vs. local), RAG hit-rate
   and faithfulness, user study (SUS). See `evaluation.md`.
8. **Discussion**: limitations (judge bias, small dataset, free-tier limits, local hardware), ethics
   (privacy, over-reliance on AI), threats to validity.
9. **Conclusion and future work**: LoRA fine-tuning of a small local model on path data, collaborative
   sessions, mobile client, learning-to-rank paths from more feedback.
