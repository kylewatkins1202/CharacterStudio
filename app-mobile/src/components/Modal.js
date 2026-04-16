import { Portal } from "@gorhom/portal"
import { useEffect, useLayoutEffect } from "react"
import { Animated, useAnimatedValue, View } from "react-native"

const CSModal = ({children, onClose, colors}) => {
    // fadeAnim will be used as the value for opacity. Initial Value: 0
    const fadeAnim = useAnimatedValue(0)
    const slideAnim = useAnimatedValue(1000)
    const fadeIn = () => {
        // Will change fadeAnim value to 1 in 5 seconds
        Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
        }).start();
    }

    const slideIn = () => {
        // Will change fadeAnim value to 1 in 5 seconds
        Animated.timing(slideAnim, {
        toValue: 0,
        delay: 3,
        duration: 300,
        useNativeDriver: true,
        }).start();
    }

    useEffect(() => {
        slideIn()
    }, [])

    return (
        <Portal onRequestClose={onClose}>
            <View style={{position: 'absolute', width: "100%", height: "100%", display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, .8)'}}></View>
            <Animated.View style={[{position: 'absolute', width: "100%", height: "100%", display: 'flex', justifyContent: 'center', alignItems: 'center'}, {
                transform: [
                    {
                        translateY: slideAnim
                    }
                ]
            }]}>
                <View style={[/* styles.modal */ { backgroundColor: colors.bg, position: 'relative', width: '100%', height: '100%', borderRadius: 16}]}>
                    {children}
                </View>
            </Animated.View>
        </Portal>
    )
}

export default CSModal