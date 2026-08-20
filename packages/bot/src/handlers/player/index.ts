import type { Rainlink } from 'rainlink'
import type { CustomClient } from '../../types'
import { createPlayer } from './playerFactory'
import { setupErrorHandlers } from './errorHandlers'
import {
    setupLifecycleHandlers,
    setupVoiceKickDetection,
    setupEmptyChannelDetection,
} from './lifecycleHandlers'
import { setupTrackHandlers } from './trackHandlers'

type CreatePlayerParams = {
    client: CustomClient
}

export const createPlayerWithHandlers = ({
    client,
}: CreatePlayerParams): Rainlink => {
    const player = createPlayer({ client })

    player.removeAllListeners()

    setupErrorHandlers(player)
    setupLifecycleHandlers(player)
    setupTrackHandlers({ player, client })
    setupVoiceKickDetection(client)
    setupEmptyChannelDetection(client, player)

    return player
}

export { lastPlayedTracks, recentlyPlayedTracks } from './trackHandlers'
export type { TrackHistoryEntry } from './trackHandlers'
