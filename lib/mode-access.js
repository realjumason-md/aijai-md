export function modeAllowsMessage(mode, isGroup) {
    switch (mode) {
        case 'private':
        case 'self':
            return false;
        case 'groups':
            return isGroup;
        case 'inbox':
            return !isGroup;
        case 'public':
        default:
            return true;
    }
}

export function getModeAccessDecision(mode, isGroup, senderIsOwnerOrSudo, hasCommand) {
    if (senderIsOwnerOrSudo || modeAllowsMessage(mode, isGroup))
        return { allowed: true, notify: false };

    return {
        allowed: false,
        notify: hasCommand && mode !== 'private'
    };
}