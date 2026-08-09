import { Innertube } from 'youtubei.js'

const FULL_URL = 'https://www.youtube.com/watch?v=6_oRaS6jD5E&list=RD6_oRaS6jD5E&start_radio=1'
const VIDEO_ID = '6_oRaS6jD5E'
const MIX_ID = 'RD6_oRaS6jD5E'

async function main() {
    const yt = await Innertube.create({ generate_session_locally: true })

    console.log('--- Plain video ID (no list/radio params) ---')
    try {
        const info = await yt.getBasicInfo(VIDEO_ID)
        console.log('playability:', info.playability_status?.status)
        console.log('title:', info.basic_info?.title)
    } catch (err) {
        console.error('ERROR:', err?.message)
    }

    console.log('\n--- Resolving as a Mix/Radio playlist (list=RD...) ---')
    try {
        const mix = await yt.music.getPlaylist(MIX_ID)
        console.log('mix resolved, items:', mix?.items?.length ?? mix?.contents?.length ?? 'unknown shape')
    } catch (err) {
        console.error('MIX ERROR:', err?.message)
    }

    console.log('\n--- getBasicInfo with the video id but simulating the full URL parse ---')
    try {
        const url = new URL(FULL_URL)
        console.log('parsed v=', url.searchParams.get('v'))
        console.log('parsed list=', url.searchParams.get('list'))
    } catch (err) {
        console.error('URL parse ERROR:', err?.message)
    }
}

main()
