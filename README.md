# @phnq/state [![CircleCI](https://circleci.com/gh/pgostovic/message.svg?style=svg)](https://circleci.com/gh/pgostovic/state)

State management for React. Kind of like Redux but with less boilerplate. It's pretty simple, but useful.

- Uses React Context.
- Similar to Redux, has "state" and "actions", but no reducers. Actions are functions and state is serializable data.
- Both state and actions are passed into components via HOC's/decorators -- (I personally like decorators).
- Actions can be async, side-effects are easy to handle.

## Usage

[See tests for usage examples.](src/__tests__/state.test.tsx)
