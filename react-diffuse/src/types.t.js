

/**
 * @typedef {object} ActionPropsType Diffuse action props
 * @property {StateType} state Current fuse state
 * @property {object} payload Action payload
 * @property {object} props Fuse box props
 * @property {(err?: any) => void} callback Action callback
 */

/**
 * @template {import('./types.t').ActionsType} ActionTypeT
 * @typedef {Object} MiddleWareType
 * @property {((storeName: FuseBoxNameType, state: DiffuseStateType&object, action: {payload: object, type: keyof ActionTypeT}) => object|any)[]=} beforeWare Actions beforeware
 * @property {((storeName: FuseBoxNameType, state: DiffuseStateType&object, action: {payload: object, type: keyof ActionTypeT}) => object|any)[]=} afterWare Actions afterware
 */

/**
 * @typedef {Object} DefaultActionsType
 * @property {(payload: object|undefined) => void} LOADING Async loading action. Updates state with payload & sets state.diffuse.loading flag to true
 * @property {(payload: object|undefined) => void} FAIL Async fail action. Updates state with payload, sets state.diffuse.err flag to true, & sets state.diffuse.loading flag to false
 * @property {(payload: object|undefined) => void} SUCCESS Async fail action. Updates state with payload & sets state.diffuse.loading flag to false
 * @property {(payload: object|undefined) => void} PROGRESS Async progress action. Updates state with payload
 * @property {(payload: object|undefined) => void} CONNECT Use action on connect to websocket. Updates state with payload & sets state.diffuse.connectionStatus to 'CONNECTED'
 * @property {(payload: object|undefined) => void} DISCONNECT Use action on disconnect from websocket. Updates state with payload & sets state.diffuse.connectionStatus to 'DISCONNECTED'
 * @property {(payload: object|undefined) => void} EMIT Use action on emit to websocket. Updates state with payload
 * @property {(payload: object|undefined) => void} CONNECT_ERROR Use action on websocket connection error. Updates state with payload & sets state.diffuse.connectionStatus to 'FAILED'
 * @property {(payload: object) => void} MESSAGE_RECIEVED Use action on websocket message received. Updates state with payload
 */

/**
 * Initial actions type
 * @typedef {(actionProps: ActionPropsType, actions: DefaultActionsType & ActionsType) => object|Promise<ActionPropsType>} InitialActionType
 */

/**
 * @typedef {object} DiffuseStateProps Diffuse reducer state
 * @property {boolean} loading Diffuse loading flag
 * @property {boolean} error Diffuse error flag
 * @property {string} connectionStatus Diffuse websocket connection status
 */

/**
 * @typedef {Object.<string, any> & {diffuse: DiffuseStateProps}} StateType Diffuse state
 */

/**
 * @typedef {{diffuse: DiffuseStateProps}} DiffuseStateType Diffuse state
 */


/**
 * Fuse box name type
 * @typedef {string} FuseBoxNameType
 */

/**
 * Reducer Actions Type
 * @typedef {Record<string, InitialActionType>} ActionsType
 */

/**
 * Reducer Selector Type
 * @typedef {Record<string, Array<(state:any) =>any>>} SelectorsType
 */

/**
 * Initial State Type
 * @typedef {Record<string | "diffuse", any>} InitialStateType
 */

/**
 * Fuse box action type
 * @typedef {(payload?: object, callback?: (err?: any) => void) => void} ActionType Action
 * @param {object} payload payload
 * @returns {void}
 */

/**
 * Fuse box action type
 * @typedef {object} FuseStateType Action
 */

/**
 * Fuse box selector type
 * @typedef {function(any):any[]} SelectorType Action
 */

/**
 * @typedef {() => any} useSelectionsType
 */

/**
 * @template S
 * @callback DiffusePromiseExecutor
 * @param {S} state Get state
 * @param {function():void} resolve Resolve state fetch
 * @param {function():void} reject Reject state fetch
 */

/**
 * @template {FuseBoxNameType} NameT
 * @template {ActionsType} ActionT
 * @template {SelectorsType} SelectorT
 * @template {InitialStateType} StateT
 * @deprecated test
 * @typedef {Object} FuseBoxType
 * @property {NameT} name Fuse box name
 * @property {Record<keyof ActionT, ActionType>} actions Fuse box actions
 * @property {function():StateT&DiffuseStateType} useState Use fuse box state hook
 * @property {Record<keyof SelectorT, useSelectionsType>} selectors Fuse box selectors
 * @property {(executor: null|(DiffusePromiseExecutor<StateT>)) => StateT&DiffuseStateType} useFetchState Use fuse box state hook
 */

/**
 * @typedef {object} ErrorBoundaryPropsType
 * @property {React.ReactNode} children 
 * @property {React.Component<{state: import('./types.t').InitialStateType}>} ErrorFallbackComponent Error fallback component, shows when a diffuse error occurs on an inner component
 * @property {React.ReactNode} SuspenseFallback Suspension fallback, shows when a inner component fetches state from diffuse
 * @property {function} onCatchError On catching diffuse error from fallback
 */

export const Types = {}