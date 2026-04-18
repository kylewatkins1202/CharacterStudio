# <b>Diffuse 3</b>
A light-weight state management solution

<p align="center">
  <img src="https://raw.githubusercontent.com/RapMints/react-diffuse/b41c2fdcdb9d6cac3e89d17c05a7d954fc6d848b/diffuse.svg"  width=300" height="300">
  <br>
  <br>
</p>

<p align="center">
  <a href="http://opensource.org/licenses/MIT"><img alt="MIT License" src="https://img.shields.io/npm/l/express.svg"></a>
  <a href="https://github.com/RapMints/react-diffuse/releases"><img alt="Current release" src="https://img.shields.io/github/release/RapMints/react-diffuse.svg"></a>
</p>

EXAMPLE: https://codesandbox.io/s/wispy-leaf-iyp9k6

## <b>Introduction</b>
React-Diffuse is a state management library for React that aims to address the shortcomings of other state management libraries. It provides a lightweight, efficient, and intuitive way to manage state in your React applications. This guide will walk you through the installation and usage of React-Diffuse, highlighting its unique features and how they tackle common problems in state management.

## <b>Table of Contents</b>
1. Installation
2. Usage
    1. Intellisense Capabilities
    2. Creating a Reducer
    3. Actions
        1. Chaining Asynchronous Actions
        2. Chaining Websocket Actions
    4. Creating a FuseBox
    5. Using FuseBoxes 
        1. useState
        2. useFetchState & DiffuseBoundary
        3. Actions
        4. Selectors
    6. Wire (for class components)
    7. Q&A: How React-Diffuse Tackles Common State Management Problems

## <b>Installation</b>
To install React-Diffuse, use the following npm command:

```bash
npm install react-diffuse
```

## <b>Usage</b>

### <b>Intellisense Capabilities</b>
React-Diffuse now supports Intellisense, providing autocomplete capabilities for reducers. This includes state, actions, and selectors. As a result, we are deprecating all hooks used to get state, actions, and selectors, and introducing a new way of implementing Diffuse. Note that this feature requires a `tsconfig.json` file to work.
Example:
```
{
    "compilerOptions": {
        "jsx": "react",
        "target": "ESNext",
        "module": "ESNext",
        "lib": [
        "DOM",
        "ESNext"
        ],
        "allowJs": true,
        "checkJs": false,
        "declaration": true,
        "emitDeclarationOnly": true,
        "declarationMap": true,
        "declarationDir": "./dist",
        "noEmit": false,
        "strict": false,
        "suppressImplicitAnyIndexErrors": true,
        "noImplicitThis": false,
        "moduleResolution": "node",
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": false,
    },
    "include": [
        "src"
    ]
}
```

### <b>Creating a Reducer</b>
A reducer in React-Diffuse is composed of four parts: `initialState`, `middleware`, `actions`, and `selectors`. Here's an example of a reducer:

```javascript
import { createReducer } from "react-diffuse"

const reducer = createReducer({
    initialState: {
        item: 0
    },
    middleware: { 
        beforeWare: [ ... ],
        afterWare: [ ... ]
    },
    actions: { 
        INCREMENT: ({state, payload}) => {
            return {
                item: state.item + 1
            }
        },
        DECREMENT: ({state}) => {
            return {
                item: state.item - 1
            }
        },
    },
    selectors: {
        toString: [
            (state) => `item is ${state.item}`, 
            (string) => `STRING: ${string}`
        ]
    }
})
```

- `initialState`: This is the initial state of your reducer. In the example above, we have an initial state where `item` is `0`.

- `middleware`: This is where you can place middleware to run before or after the actions are completed in dispatch. 

- `actions`: Actions are tasks that you can dispatch from any component, inheriting a store. 

- `selectors`: Selectors mutate data from our state and only update when the mutation has changed. They are an array of selection functions. If there's only one function, that function takes in state as an argument. If there's more than one function, every function except the last one takes in state. The last function takes all previous returns as its arguments.

### <b>Actions</b>
Actions in React-Diffuse can be run by dispatching or by running the action explicitly. Both asynchronous and regular functions are handled the same way and can take in an object containing `state`, `payload`, and `props`.

- `state`: The current state.
- `payload`: The payload that can be passed in when running the action.
- `props`: The props of the current store, which can be passed in when creating a store.
- `callback`: A callback that can be

passed in when running the action.

#### <b>Chaining Asynchronous Actions</b>
React-Diffuse allows you to chain actions within asynchronous actions. This is particularly useful when you want to manage different states of an asynchronous operation, such as loading, progress, success, and failure. Here's an example:

```javascript
actions: { 
    GET_COUNT: async ({state, payload, props, callback}, {SUCCESS, PROGRESS, FAIL, LOADING}) => {
        try {
            LOADING()

            let res = await axios.get(props.url)
            
            PROGRESS({percent: 50})

            res = await axios.get(props.url)

            SUCCESS({
                item: res.count,
                percent: 100
            })
        }
        catch(e) {
            callback(e)
            FAIL({error: e.message})
        }
    }
}
```
In the example above, `GET_COUNT` is an asynchronous function that chains other actions such as `LOADING`, `PROGRESS`, and `SUCCESS` or `FAIL`. You can use any action you've created in chaining.

#### <b>Chaining Websocket Actions</b>
Just like asynchronous actions, you can chain websocket actions in React-Diffuse. There are 5 predetermined actions you can use when handling websockets: `CONNECT`, `CONNECT_ERROR`, `MESSAGE_RECEIVED`, `DISCONNECT`, & `EMIT`. 

```javascript
SUBSCRIBE: ({state, payload}, {CONNECT, CONNECT_ERROR}) => {
    socket.on('connection', data => {
        CONNECT()
    })

    socket.on('msg', (data) => {
        MESSAGE_RECIEVED({message: data})
    })

    socket.on("connect_error", (err) => {
        console.log(`connect_error due to ${err.message}`);
        CONNECT_ERROR()
    })
},
UNSUBSCRIBE: ({state, payload}, {DISCONNECT}) => {
    socket.disconnect()
    DISCONNECT()
}
EMIT_USER: ({state, payload}) => {
    socket.emit("send_user", payload.username)
}
```

### <b>Creating a FuseBox</b>
React-Diffuse introduces the concept of a "FuseBox", which is a store created from a reducer. You can create multiple FuseBoxes from a single reducer, allowing you to manage different parts of your application state independently.

```javascript
// Stores.js 

import count from "./count";

const AFuseBox = count.createFuseBox('AFuseBox', props: {url: "www.example.com"})
const BFuseBox = count.createFuseBox('BFuseBox', props: {url: "www.example2.com"})

export {AFuseBox, BFuseBox}
```

### <b>Using FuseBoxes</b> 
FuseBoxes provide a simple and intuitive API for managing state in your React components.

#### <b>useState</b>
The `useState` hook is used to get the state of a FuseBox. For example, to get `item` from the `AFuseBox` state you would use:

```javascript
import { AFuseBox } from '../StateManagement/Stores'

function Text(props) {
    // Get item from state
    const item = AFuseBox.getState().item

    return (
        <button>
            {item}
        </button>
    )
}
```
This will return `AFuseBox`'s state and rerender the component using it whenever the state is changed. 

#### <b>useFetchState & DiffuseBoundary</b>
The `useFetchState` hook and `DiffuseBoundary` component are used together to handle loading and errors for asynchronous actions. The `useFetchState` hook fetches the state of a FuseBox while waiting for an asynchronous action to finish. The `DiffuseBoundary` component provides a fallback UI for loading and error states.

```javascript
import { AFuseBox } from '../StateManagement/Stores'

function Text(props) {
    // Fetch text
    const fuseBox = props.fetchText()

    return (
        <span>
            {fuseBox.text}
        </span>
    )
}

function Main(props) {
    useEffect(() => {
        // Run get text asyncronous action
        AFuseBox.actions.getText()
    },[])
    return (
        <DiffuseBoundary 
            SuspenseFallback={<>LOADING.................</>} 
            ErrorFallbackComponent={({state}) => { console.log(state); return (<>{state.error}</>)}}
        >
            <Text fetchText={AFuseBox.useFetchState}/>
        </DiffuseBoundary>
    )
}
```
In the example above, while waiting on the asynchronous action to finish, the `Text` component will fall back to `SuspenseFallback` and when an error occurs on the asynchronous action, the component will fallback to `ErrorFallbackComponent`.

An fetch state being resolved or rejected is determined by "store.diffuse" in the default executor. The executor can be overwritten like so:
```javascript
    AFuseBox.useFetchState((state, resolve, reject) => {
        if (store?.diffuse?.loading === false && store?.diffuse?.completed === true) {
            resolve()
        }
        else if (store?.diffuse?.loading === false && store?.diffuse?.error !== false) {
            reject()
        }
    })
```
NOTE: This an example of the default executor.

#### <b>Actions</b>
React-Diffuse allows you to use actions directly instead of dispatching. Here's how you can get the actions for a FuseBox and use them:

```javascript
import { AFuseBox } from '../StateManagement/Stores'

function Text(props) {
    const actions = AFuseBox.actions
    
    return (
        <button onClick={() => actions.INCREMENT({}, callback)}>
            Dispatch
        </button>
    )
}
```
Each action can take in a payload and callback like so: `actions.SOMEACTION(payload, callback)`

#### <b>Selectors</b>
Selectors are used to get an aggregation of the current state, based on selector functions provided in the `createReducer` function. 

```javascript
import { AFuseBox } from '../StateManagement/Stores'

function Text(props) {
    const sum = AFuseBox.selectors.MySelector()

    return (
        <div>
            {sum}
        </div>
    )
}
```
This will return `AFuseBox`'s state aggregated using the selector and rerender the component using it whenever the selections value is changed. 

### <b>Wire (for class components)</b>
The `wire` function is used to connect a component to a global state. Below we will wire a `Text` component to a global state `AFuseBox`.

```javascript
import { useEffect, useState } from "react";
import { wire } from "./Diffuse";
import { AFuseBox } from "./StateManagement/States";

class Text { 
    constructor(props) {
        super(props)
    }

    componentWillUnmount() {
        props.AFuseBox.actions.INITIALIZE_STORE()
    }

    render() {
        return (
            <div style={{ backgroundColor: 'red' }} onClick={() =>
                props.AFuseBox.actions.INCREMENT()
            }>
            Items: {props.AFuseBox.store.item} 
            <Text2 />
            </div>
        );
    }
};
}

export default wire([AFuseBox])(Text);
```
In this case, `Text` will be connected to the `AFuseBox` component, causing it to rerender only when its props or `AFuseBox`'s state changes. You can use `INITIALIZE_STORE` to initialize a global state to its initial state. You can pass through a payload that will be stored in the state on unmount.

## <b>Q&A: How React-Diffuse Tackles Common State Management Problems</b>

React-Diffuse addresses several common problems in state management libraries:

1. **Verbose and complex syntax**: Many state management libraries require a lot of boilerplate code to set up and use. React-Diffuse simplifies this with a straightforward API and intuitive concepts like reducers, actions, and selectors.

2. **Difficulty in managing asynchronous actions**: Asynchronous actions are a common source of complexity in state management. React-Diffuse provides a simple way to chain asynchronous actions, making it easy to manage different states of an asynchronous operation.

3. **Lack of flexibility in sharing state between components**: React-Diffuse introduces the concept of a FuseBox, which allows you to create multiple stores from a single reducer. This gives you the flexibility to manage different parts of your application state independently.

4. **Difficulty in handling loading and error states**: React-Diffuse provides the `useFetchState` hook and `DiffuseBoundary` component to handle loading and error states for asynchronous actions. This makes it easy to provide a good user experience even when things go wrong.

5. **Lack of support for class components**: While many state management libraries focus on hooks and functional components, React-Diffuse provides the `wire` function to connect class components to global state.

6. **Lack of Intellisense support**: React-Diffuse supports Intellisense, providing autocomplete capabilities for reducers. This makes it easier to write and understand your code.

By addressing these problems, React-Diffuse provides a lightweight and efficient solution for state management in React applications.
