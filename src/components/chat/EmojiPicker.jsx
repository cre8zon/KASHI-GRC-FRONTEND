import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

/**
 * A small built-in emoji picker — no library, no network. Used by the chat
 * composer (insert at the caret) and for reactions on a message.
 *
 *   <EmojiPicker onPick={(e) => …} onClose={() => …} className="absolute …" />
 *
 * Search matches the category and a few keywords per emoji.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏']

// [emoji, keywords]
const CATEGORIES = [
  ['Smileys', '😀', [
    ['😀', 'grin happy smile'], ['😃', 'smile happy'], ['😄', 'smile laugh'], ['😁', 'grin'], ['😆', 'laugh'],
    ['😅', 'sweat relief'], ['😂', 'joy laugh tears lol'], ['🤣', 'rofl laugh'], ['🙂', 'smile'], ['🙃', 'upside down'],
    ['😉', 'wink'], ['😊', 'blush happy'], ['😇', 'angel innocent'], ['🥰', 'love hearts'], ['😍', 'love heart eyes'],
    ['🤩', 'star struck wow'], ['😘', 'kiss'], ['😋', 'yum tasty'], ['😛', 'tongue'], ['😜', 'wink tongue'],
    ['🤪', 'crazy'], ['🤗', 'hug'], ['🤭', 'oops giggle'], ['🤫', 'shh quiet'], ['🤔', 'think hmm'],
    ['🤐', 'zip quiet'], ['🤨', 'raised eyebrow doubt'], ['😐', 'neutral'], ['😑', 'expressionless'], ['😶', 'speechless'],
    ['😏', 'smirk'], ['😒', 'unamused'], ['🙄', 'eye roll'], ['😬', 'grimace awkward'], ['😌', 'relieved'],
    ['😔', 'pensive sad'], ['😪', 'sleepy'], ['😴', 'sleep tired'], ['😷', 'mask sick'], ['🤒', 'sick ill'],
    ['🥵', 'hot'], ['🥶', 'cold'], ['😵', 'dizzy'], ['🤯', 'mind blown'], ['🥳', 'party celebrate'],
    ['😎', 'cool sunglasses'], ['🤓', 'nerd'], ['🧐', 'monocle inspect'], ['😕', 'confused'], ['😟', 'worried'],
    ['🙁', 'frown'], ['😮', 'wow surprised open mouth'], ['😯', 'hushed'], ['😲', 'astonished'], ['😳', 'flushed'],
    ['🥺', 'pleading'], ['😢', 'cry sad'], ['😭', 'sob cry'], ['😱', 'scream fear'], ['😖', 'confounded'],
    ['😞', 'disappointed'], ['😓', 'sweat'], ['😩', 'weary'], ['😫', 'tired'], ['🥱', 'yawn'],
    ['😤', 'triumph huff'], ['😡', 'angry mad'], ['😠', 'angry'], ['🤬', 'swear'], ['💀', 'skull dead'],
    ['🤡', 'clown'], ['👻', 'ghost'], ['🤖', 'robot bot'], ['😺', 'cat smile'], ['🙈', 'see no evil monkey'],
  ]],
  ['People', '👍', [
    ['👍', 'thumbs up yes ok like'], ['👎', 'thumbs down no'], ['👌', 'ok'], ['✌️', 'peace victory'], ['🤞', 'fingers crossed luck'],
    ['🤟', 'love you'], ['🤘', 'rock'], ['🤙', 'call me'], ['👈', 'left'], ['👉', 'right'],
    ['👆', 'up'], ['👇', 'down'], ['☝️', 'point up'], ['✋', 'hand stop'], ['👋', 'wave hello bye'],
    ['🖐️', 'hand'], ['👏', 'clap applause'], ['🙌', 'raise hands hooray'], ['👐', 'open hands'], ['🤝', 'handshake deal agree'],
    ['🙏', 'pray thanks please'], ['✍️', 'write'], ['💪', 'strong muscle'], ['🧠', 'brain smart'], ['👀', 'eyes look'],
    ['👁️', 'eye'], ['🫡', 'salute'], ['🤷', 'shrug'], ['🤦', 'facepalm'], ['🙋', 'raise hand question'],
    ['🙆', 'ok gesture'], ['🙅', 'no gesture'], ['💁', 'tipping hand'], ['🧑‍💻', 'developer laptop'], ['🧑‍💼', 'office worker'],
    ['👩‍⚖️', 'judge'], ['🕵️', 'detective auditor'], ['👮', 'police'], ['🧑‍🏫', 'teacher'], ['🏃', 'run'],
  ]],
  ['Nature & food', '🌱', [
    ['🐶', 'dog'], ['🐱', 'cat'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
    ['🦁', 'lion'], ['🐯', 'tiger'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐢', 'turtle slow'],
    ['🐝', 'bee'], ['🦋', 'butterfly'], ['🌱', 'seedling grow'], ['🌳', 'tree'], ['🌵', 'cactus'],
    ['🌸', 'blossom flower'], ['🌻', 'sunflower'], ['🍀', 'clover luck'], ['🍁', 'maple leaf'], ['🌈', 'rainbow'],
    ['☀️', 'sun'], ['🌙', 'moon night'], ['⭐', 'star'], ['🌟', 'glowing star'], ['⚡', 'lightning zap'],
    ['🔥', 'fire hot lit'], ['💧', 'drop water'], ['🌊', 'wave'], ['❄️', 'snow'], ['☔', 'rain umbrella'],
    ['☕', 'coffee tea'], ['🍵', 'tea chai'], ['🍕', 'pizza'], ['🍔', 'burger'], ['🍟', 'fries'],
    ['🍰', 'cake'], ['🎂', 'birthday cake'], ['🍩', 'donut'], ['🍪', 'cookie'], ['🍫', 'chocolate'],
    ['🍎', 'apple'], ['🍌', 'banana'], ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🥭', 'mango'],
    ['🍛', 'curry'], ['🍜', 'noodles'], ['🍚', 'rice'], ['🥗', 'salad'], ['🍻', 'cheers beer'],
  ]],
  ['Activities & travel', '🎉', [
    ['🎉', 'party tada celebrate'], ['🎊', 'confetti'], ['🎈', 'balloon'], ['🎁', 'gift present'], ['🏆', 'trophy win'],
    ['🥇', 'gold medal first'], ['🥈', 'silver medal'], ['🥉', 'bronze medal'], ['🏅', 'medal'], ['🎯', 'target goal bullseye'],
    ['⚽', 'football soccer'], ['🏏', 'cricket'], ['🏀', 'basketball'], ['🎾', 'tennis'], ['🎮', 'game'],
    ['🎲', 'dice'], ['🧩', 'puzzle'], ['🎨', 'art'], ['🎵', 'music'], ['🎤', 'mic'],
    ['🎬', 'film'], ['📸', 'camera'], ['🚀', 'rocket launch ship'], ['✈️', 'plane travel'], ['🚗', 'car'],
    ['🚕', 'taxi'], ['🚆', 'train'], ['🚲', 'bike'], ['🏠', 'home house'], ['🏢', 'office building'],
    ['🏦', 'bank'], ['🏛️', 'government'], ['🏝️', 'island holiday'], ['🗺️', 'map'], ['🧭', 'compass'],
  ]],
  ['Objects', '💡', [
    ['💡', 'idea bulb'], ['📌', 'pin'], ['📎', 'paperclip attach'], ['📝', 'memo note'], ['📄', 'document page'],
    ['📁', 'folder'], ['📂', 'open folder'], ['🗂️', 'dividers'], ['📊', 'chart bar'], ['📈', 'chart up'],
    ['📉', 'chart down'], ['📅', 'calendar date'], ['🗓️', 'calendar'], ['⏰', 'alarm clock'], ['⏳', 'hourglass wait'],
    ['⌛', 'hourglass done'], ['💻', 'laptop'], ['🖥️', 'computer'], ['📱', 'phone mobile'], ['☎️', 'telephone'],
    ['📞', 'call phone'], ['📧', 'email'], ['✉️', 'envelope mail'], ['📢', 'announce loudspeaker'], ['🔔', 'bell notify'],
    ['🔕', 'mute'], ['🔒', 'lock secure'], ['🔓', 'unlock'], ['🔑', 'key'], ['🛡️', 'shield security'],
    ['⚙️', 'gear settings'], ['🔧', 'wrench fix'], ['🔨', 'hammer'], ['🧰', 'toolbox'], ['🔍', 'search magnify'],
    ['📚', 'books'], ['📖', 'book'], ['🖊️', 'pen'], ['✏️', 'pencil edit'], ['📋', 'clipboard'],
    ['💰', 'money bag'], ['💵', 'cash'], ['💳', 'card payment'], ['🧾', 'receipt'], ['⚖️', 'scale law compliance'],
  ]],
  ['Symbols', '✅', [
    ['✅', 'check done yes'], ['☑️', 'checkbox'], ['✔️', 'tick'], ['❌', 'cross no wrong'], ['❎', 'cross'],
    ['⚠️', 'warning'], ['🚫', 'forbidden no'], ['⛔', 'stop'], ['❗', 'exclamation important'], ['❓', 'question'],
    ['‼️', 'double exclamation'], ['⁉️', 'interrobang'], ['💯', 'hundred perfect'], ['🆗', 'ok'], ['🆕', 'new'],
    ['🔴', 'red circle'], ['🟠', 'orange circle'], ['🟡', 'yellow circle'], ['🟢', 'green circle'], ['🔵', 'blue circle'],
    ['⚪', 'white circle'], ['⚫', 'black circle'], ['➡️', 'arrow right'], ['⬅️', 'arrow left'], ['⬆️', 'arrow up'],
    ['⬇️', 'arrow down'], ['🔁', 'repeat'], ['🔄', 'refresh'], ['➕', 'plus'], ['➖', 'minus'],
    ['❤️', 'heart love'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'], ['💙', 'blue heart'],
    ['💜', 'purple heart'], ['🖤', 'black heart'], ['💔', 'broken heart'], ['💖', 'sparkle heart'], ['✨', 'sparkles'],
  ]],
]

export function EmojiPicker({ onPick, onClose, className }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState(0)
  const box = useRef(null)

  // Close on outside click or Escape.
  useEffect(() => {
    const down = (e) => { if (box.current && !box.current.contains(e.target)) onClose?.() }
    const key = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [onClose])

  const term = q.trim().toLowerCase()
  const items = term
    ? CATEGORIES.flatMap(([, , list]) => list).filter(([, k]) => k.includes(term))
    : CATEGORIES[cat][2]

  return (
    <div ref={box} className={cn('w-72 rounded-card border border-border bg-surface-raised shadow-overlay p-2 z-40', className)}
      onMouseDown={(e) => e.stopPropagation()}>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search emoji" autoFocus
        className="w-full h-7 px-2 mb-1.5 rounded-ctl border border-border bg-surface-raised text-xs text-text-primary" />
      {!term && (
        <div className="flex gap-0.5 mb-1.5 border-b border-border-subtle pb-1">
          {CATEGORIES.map(([name, icon], i) => (
            <button key={name} type="button" title={name} onClick={() => setCat(i)}
              className={cn('flex-1 h-7 rounded-ctl text-base', i === cat ? 'bg-surface-overlay' : 'hover:bg-surface-overlay/60')}>{icon}</button>
          ))}
        </div>
      )}
      <div className="h-48 overflow-y-auto grid grid-cols-8 gap-0.5 content-start">
        {items.length === 0
          ? <p className="col-span-8 text-xs text-text-muted p-2">No emoji found.</p>
          : items.map(([e, k]) => (
            <button key={e} type="button" title={k.split(' ')[0]} onClick={() => onPick(e)}
              className="h-8 rounded-ctl text-lg leading-none hover:bg-surface-overlay">{e}</button>
          ))}
      </div>
    </div>
  )
}
