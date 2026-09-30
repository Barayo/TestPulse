## ADDED Requirements

### Requirement: Human-readable MCP tool result text
Every MCP tool SHALL include a short, human-readable, one-sentence summary of its result in the tool call response's text content, in addition to the structured result the calling model parses programmatically. This summary SHALL be built only from values already resolved while handling the call, without any additional lookup.

#### Scenario: A create tool's result includes a readable summary
- **WHEN** an agent calls `upsert_test_case` to create a new case
- **THEN** the tool call response's text content includes a sentence naming the created case's key and title, and the structured result still includes the full case record

#### Scenario: A batch tool's result includes a readable summary
- **WHEN** an agent calls `bulk_add_cases` to create a batch of cases
- **THEN** the tool call response's text content includes a sentence stating how many cases were created and in which project

#### Scenario: A read tool's result includes a readable summary
- **WHEN** an agent calls `search` with a query that matches results
- **THEN** the tool call response's text content includes a sentence stating how many matches were found for the query

#### Scenario: Structured content is unaffected by the readable summary
- **WHEN** an agent calls any MCP tool successfully
- **THEN** the tool call response's structured content is the same value it would be without the readable summary text present
