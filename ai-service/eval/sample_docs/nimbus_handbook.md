# Nimbus Labs Employee & Engineering Handbook (fictional sample for RAG evaluation)

Nimbus Labs is a fictional software company used only to evaluate StratifyAI's document retrieval.
None of these facts exist on the internet, so a correct answer proves the model used the retrieved text.

## Office and facilities

The Nimbus Labs head office has four floors. The campus cafeteria was renovated in March 2023 and now
serves breakfast from 08:00 and lunch from 12:00 to 14:30. Bicycle parking is available in the basement.
Meeting rooms are named after constellations and can be booked through the internal portal.

## Working hours and leave

Nimbus Labs uses flexible working hours. Core collaboration hours are 11:00 to 15:00 local time, when
everyone is expected to be reachable. New employees receive 18 paid vacation days per year, rising to 22
days after three years of service. Sick leave does not require a doctor's note for the first two days.

## Learning and development

Each employee has a learning stipend of 1,200 euros per year, which can be spent on courses, books and
conference tickets. Unused stipend does not roll over. Engineers may also spend every second Friday
afternoon on self-directed learning projects.

## Engineering practices

All code lives in a monorepo. The code review policy requires two approvals for every pull request, and
at least one approval must come from a senior engineer. Pull requests should stay under 400 changed lines.
Production deployments happen through the continuous delivery pipeline; deployments on Fridays need
approval from the engineering manager on duty.

On-call rotations last one week and are handed over on Mondays at 10:00. The on-call engineer must
acknowledge pages within 15 minutes. Application logs are retained for 30 days, while audit logs are kept
for one year to satisfy compliance requirements.

## Project Orion

Orion is the company's search platform. It uses PostgreSQL 16 with read replicas for metadata and an
in-house vector index for semantic search. The p95 latency target for the Orion search API is 200 ms,
and the error budget is 0.1% of requests per month. Orion is owned by the Discovery team, which has
seven engineers and one product manager.
