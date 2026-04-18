# <b>Diffuse</b>
Light weight global state managment solution

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

<b>Table of Contents</b>
1. Installation
2. Usage
    1. Create Reducer
    2. <b style='color: blue'>(NEW)</b> Intellisense Capabilites
    3. Actions
        1. Chaining Async Actions
        2. Chaining Multiple Store Actions
        3. Chaining Websocket Actions
    4. <b style='color: blue'>(NEW)</b> createFuseBox
    5. <b style='color: blue'>(NEW)</b> Using FuseBoxes 
        1. useState
        2. useFetchState & DiffuseBoundary
        3. actions
        4. selectors
    6. Wire

## <b>Installation</b>
Install npm package
```
npm install react-diffuse
```

## <b>Usage</b>
### <b>Create reducer</b>
Firstly, we have the reducer, which will look something like this:
```
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
                    item: state.item + 1
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
As you can see there are 4 parts to this reducer. 
* First we have an  <b>initialState</b>, the initial state of your reducer, in the above example we have an initial state where the item is 0. 
* Next, we have <b>middleware</b>, Where we can place before ware and after ware to run before or after the actions are completed in dispatch. 
* Then, we have <b>actions</b>. Actions are jobs that you can dispatch from any component, inheriting a store. 
* Lastly, we have <b>selections</b>. Selections mutate data from our state and only update when the mutation has changed. Selectors are just an array of selection functions. If only one function, that function takes in state as an argument. If more than one function every function except the last function takes in state. The last function takes all previous returns as its arguments for example

### <b>Intellisense Capabilities</b>
Now with jsdoc added all reducers have the capability of autocomplete. Whether it is state, actions, or selectors as you are coding options for auto complete are provided. With this in mind, we will be deprecating all hooks used to get state, actions, and selectors and introduce a new way of implementing Diffuse.
NOTE: Requires tsconfig.json to work. Example:
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
### <b>Actions</b>
Actions can be run from dispatching or by running the action explicitly. Async functions and regular functions are handled the same and can both take in an object containing state, payload, and props. 

*   state - Current state
*   payload - Payload that can be passed in on running the action
*   props - Props of current store which can be passed in when creating a store
*   callback - Callback that can be passed in on running the action
#### <b>Chaining Asynchronous Actions</b>
The second object the action functions can recieve are actions which can be used to chain actions. Take a look below at the <i>GET_COUNT</i>

<b>*** NOTE The names INITIALIZE_STORE, LOADING, SUCCESS, FAIL, and PROGRESS are reserved and may not be used when creating your own action names</b>

```
    actions: { 
            INCREMENT: ({state}, actions) => {
                return {
                    item: state.item + 1
                }
            },
            DECREMENT: ({state}, actions) => {
                return {
                    item: state.item + 1
                }
            },
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
In the example above example GET_COUNT is an async function and is chaining other actions such as LOADING, PROGRESS, and SUCCESS or FAIL. You may use any action you've created in chaining.

* LOADING will change the state to 
```
    state: {
        diffuse: {
            ...,
            loading: true
        }
        // Some "payload", if any
        ...
    }
```
* PROGRESS will change the state to 
```
    state: {
        ...
        // Some "payload", if any
        ...
    }
```
* SUCCESS will change the state to 
```
    state: {
        diffuse: {
            ...,
            loading: false
            error: false
        }
        // Some "payload", if any
        ...
    }
```

* FAIL will change the state to 
```
    state: {
        diffuse: {
            ...,
            loading: false,
            error: true
        }
        // Some "payload", if any
        ...
    }
```
#### <b>Chaining Multiple Store Actions</b>
Additionally, actions from one store can use actions from another store. Similar to the above examples of a chaining actions, except you can use actions from other stores.
```
    actions: { 
            INCREMENT: ({state}, actions) => {
                // Run action for another store
                BFuseBox.actions.DECREMENT()

                // Run action for another store
                CFuseBox.actions.DECREMENT()
            },
        }
```
NOTE: This design pattern will trigger a rerender on any component using BFuseBox or CFuseBox however, this is being called from AFuseBox

#### <b>Chaining Websocket Actions</b>
Similary, you can chain websocket actions just like async actions. There are 5 predetermined actions you can use when handling websockets: CONNECT, CONNECT_ERROR, MESSAGE_RECEIVED, DISCONNECT, & EMIT. Note that you can replace these action names.
Below is an example of a SUBSCRIBE, UNSUBSCRIBE, & EMIT action using socket io:
```
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
* CONNECT will change the state to 
```
    state: {
        diffuse: {
            ...,
            connectionStatus: "CONNECTED"
        }
        // Some "payload", if any
        ...
    }
```
* DISCONNECT will change the state to 
```
    state: {
        diffuse: {
            ...,
            connectionStatus: "DISCONNECTED"
        }
        // Some "payload", if any
        ...
    }
```
* CONNECT_ERROR will change the state to 
```
    state: {
        diffuse: {
            ...,
            connectionStatus: "FAILED"
        }
        // Some "payload", if any
        ...
    }
```
* MESSAGE_RECIEVED will change the state to 
```
    state: {
        ...
        // Some "payload", if any
        ...
    }
```
* EMIT will change the state to 
```
    state: {
        ...
        // Some "payload", if any
        ...
    }
```

### createFuseBox
We have changed the name of the function for creating stores from "createStore" to "createFuseBox", Once you've created your reducer you can use it to create stores like below:
```
    // Stores.js 
    
    import count from "./count";

    const AFuseBox = count.createFuseBox('AFuseBox', props: {url: "www.example.com"})
    const BFuseBox = count.createFuseBox('BFuseBox', props: {url: "www.example2.com"})

    export {AFuseBox, BFuseBox}
```
As you can see above we imported our count reducer we created above in the create reducer section. A single reducer can be used to create multiple stores. In this exstoreNameample we used the count reducer to create AFuseBox and BFuseBox

### <b>Using FuseBox</b>
#### <b>useState</b>
The "useState" hook is used to get the state of a fusebox. For example to get _item_ from the _AFuseBox_ state you would use:

```
    import { AFuseBox } from '../StateManagement/Stores'

    function Text(props) {
        const item = AFuseBox.getState().item

        return (
            <button>
                {item}
            </button>
        )
    }
```
This will return AFuseBox's state and rerender the component using it whenever the state is changed. 

#### <b>useFetchState & DiffuseBoundary</b>
The "useFetchState" hook & "DiffuseBoundary" Component are used together to handle loading and errors for asyncronous actions. Firstly, we will tackle the "useFetchState" hook, which is used to fetch the state of a fusebox while waiting for an asyncronous action to finish. For example below we are fetching the text in the Text Component using the "useFetchState" hook passed down from Main:

```
    import { AFuseBox } from '../StateManagement/Stores'

    function Text(props) {
        const fuseBox = props.fetchText()

        return (
            <span>
                {fuseBox.text}
            </span>
        )
    }

    function Main(props) {
        useEffect(() => {
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
Notice how we wrapped "Text" in "DiffuseBoundary", this will ensure that while waiting on the asyncronous action to finish the inner component will fall back "SuspenseFallback" and when an error occurs on the asyncronous action the inner component will fallback to "ErrorFallbackComponent".

An action being resolved or rejected is determined by "store.diffuse" in the default executor. The executor can be overwritten like so:
```
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

#### <b>actions</b>
Next we have "actions", which allows you to use actions directly instead of dispatch. First you get the actions for AFuseBox like so:

```
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
Each action can take in a payload and callback like so:
`actions.SOMEACTION(payload, callback)`

#### <b>selectors</b>
Lastly, we have our "selectors". Selectors are used to get an aggregation the current state, based on selector functions provided in the createReducer Function. Each selector is function that is ran without props to return
```
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

This will return AFuseBox's state aggregated using the selector and rerender the component using it whenever the selections value is changed. 

### <b>Wire (class components)</b>
Lastly, we have wire. Wire is used to wire a component to a global state. Below we will wire a Text compononent to a global state AFuseBox

```
    import { useEffect, useState } from "react";
    import { wire } from "./Diffuse";
    import { AFuseBox } from "./StateManagement/States";

    const Text = (props) => {
        useEffect(()=>{
            return () => {
                props.AFuseBox.actions.INITIALIZE_STORE()
            }
        }, [])
        return (
            <div style={{ backgroundColor: 'red' }} onClick={() =>
                props.AFuseBox.actions.INCREMENT()
            }>
            Items: {props.AFuseBox.store.item} 
            <Text2 />
            </div>
        );
    };

    export default wire([AFuseBox])(Text);

```
(AFuseBox is a string equal to AFuseBox). Notice that we import "wire" at the top and use it at export on the bottom. We pass two parameters to the object the <b>fuseName</b> which is the reducer you'd like to reference and the <b>Child</b> which represents the component to wire the fuses to to get the store and dispatch of the reducer in your props. In this case Text will be fused to the AFuseBox component, causing it to rerender only when its props or AFuseBox's state changes.

You can use INITIALIZE_STORE as shown above to initialize a global state to its initial state. You can pass through a payload that will be stored in the state on unmount

Notice above we call the dispatch of AFuseBox by referencing it from props. ```props.AFuseBox.dispatch({type: 'INCREMENT'})``` this will cause ```props.AFuseBox.store.item``` to increment. Any other component inheriting the same reducer will rerender every time that dispatcher is called.
