import {Image as ReactImage} from 'react-native'
import { AppStore } from '../stores/AppStore'
import { useMemo } from 'react'
const Image = ({src, style, resizeMode, ...props}) => {
    
    const {serverUrl} = AppStore.useState()

    const uri = useMemo(() => {
        if (src.startsWith('/api')) {
            return serverUrl + src
        }

        return src
    }, [serverUrl])

    return (
         <ReactImage
            {...props}
            source={{ uri: uri }}
            style={style}
            resizeMode={resizeMode}
        />
    )
}

export default Image