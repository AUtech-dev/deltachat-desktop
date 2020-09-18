import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { ipcBackend } from '../../ipc'
import debounce from 'debounce'
import { getLogger } from '../../../shared/logger'
import { useDebouncedCallback } from 'use-debounce'
import {
  ChatListItemType,
  MessageSearchResult,
} from '../../../shared/shared-types'
import { DeltaBackend } from '../../delta-remote'

const log = getLogger('renderer/helpers/ChatList')

/** @deprecated */
const debouncedGetChatListIds = debounce(
  (
    listFlags: number,
    queryStr: string,
    queryContactId: number,
    cb: (...args: any) => void
  ) => {
    DeltaBackend.call(
      'chatList.getChatListIds',
      listFlags,
      queryStr,
      queryContactId
    ).then(cb)
  },
  200
)

/** @deprecated */
export function useChatListIds(
  _listFlags?: number,
  _queryStr?: string,
  _queryContactId?: number
) {
  if (!_queryStr) _queryStr = ''

  const [listFlags, setListFlags] = useState(_listFlags)
  const [queryStr, setQueryStr] = useState(_queryStr)
  const [queryContactId, setQueryContactId] = useState(_queryContactId)
  const [chatListIds, setChatListIds] = useState([])

  const getAndSetChatListIds = (immediatly: boolean = false) => {
    if (immediatly === true) {
      DeltaBackend.call(
        'chatList.getChatListIds',
        listFlags,
        queryStr,
        queryContactId
      ).then(setChatListIds)
      return
    }
    debouncedGetChatListIds(listFlags, queryStr, queryContactId, setChatListIds)
  }

  const refetchChatlist = () => {
    log.debug('useChatListIds: refetchingChatlist')
    getAndSetChatListIds()
  }

  useEffect(() => {
    log.debug('useChatListIds: onComponentDidMount')
    ipcBackend.on('DD_EVENT_CHATLIST_CHANGED', refetchChatlist)
    return () => {
      ipcBackend.removeListener('DD_EVENT_CHATLIST_CHANGED', refetchChatlist)
    }
  }, [listFlags, queryStr, queryContactId])

  useEffect(() => {
    log.debug(
      'useChatListIds: listFlags, queryStr or queryContactId changed, refetching chatlistids'
    )
    getAndSetChatListIds()
  }, [listFlags, queryStr, queryContactId])

  return {
    chatListIds,
    listFlags,
    setListFlags,
    queryStr,
    setQueryStr,
    queryContactId,
    setQueryContactId,
  }
}

/**
 * fetch chats by IDs
 * only if chats are
 * - in view
 * - not already loaded
 */
/** @deprecated */
export const useLazyChatListItems = (chatListIds: number[]) => {
  const scrollRef = useRef(null)
  const fetching = useRef([])
  const [chatItems, setChatItems] = useState<{
    [key: number]: ChatListItemType
  }>({})

  const isNotReady = () => {
    if (chatListIds.length === 0) return true
    if (!scrollRef.current) {
      log.warn('scrollRef is undefined')
      return true
    }
    return false
  }

  const getIndexStartEndInView = () => {
    const { scrollHeight, scrollTop, clientHeight } = scrollRef.current
    // console.log('useLazyChatListItems: getIndexStartEndInView', scrollRef, scrollHeight, scrollTop, clientHeight, chatListIds.length)
    const itemHeight = scrollHeight / chatListIds.length
    const indexStart = Math.floor(scrollTop / itemHeight)
    const indexEnd = Math.floor(1 + indexStart + clientHeight / itemHeight)
    // console.log('useLazyChatListItems: getIndexStartEndInView indexStart indexEnd', indexStart, indexEnd)
    return [indexStart, indexEnd] as [number, number]
  }

  const chatIdsInView = (offset?: number) => {
    let [indexStart, indexEnd] = getIndexStartEndInView()
    if (offset) {
      indexStart = indexStart - offset
      if (indexStart < 0) indexStart = 0
      indexEnd = indexEnd + offset
      if (indexEnd > chatListIds.length - 1) indexEnd = chatListIds.length - 1
    }
    const chatIds = []
    for (let i = indexStart; i <= indexEnd; i++) {
      const chatId = chatListIds[i]
      if (!chatId) break
      chatIds.push(chatId)
    }
    // console.log('useLazyChatListItems: chatIdsInView', chatIds)
    return chatIds
  }

  const isChatIdInView = (chatId: number) =>
    chatIdsInView().indexOf(chatId) !== -1

  const fetchChatsInView = async (offset: number) => {
    if (isNotReady()) return
    const chatIds = chatIdsInView(offset)
    const chats = await fetchChats(chatIds)

    if (!chats) return
    // log.debug('useLazyChatListItems: Fetched chats in view', Object.keys(chats))
    setChatItems(chatItems => {
      return { ...chatItems, ...chats }
    })
  }

  /**
   * called after chatlist update
   */
  const updateChatsInViewUnsetOthers = async () => {
    if (isNotReady()) return
    const chatIds = chatIdsInView()
    const chats = await fetchChats(chatIds, true)

    if (!chats) return
    // log.debug('useLazyChatListItems: Force updating chats in view, unsetting others', Object.keys(chats))
    setChatItems(chats)
  }

  const fetchChats = async (chatIds: number[], force = false) => {
    const chatIdsToFetch = chatIds.filter(i => {
      if (fetching.current.indexOf(i) === -1) {
        if (
          typeof chatItems[i] === 'undefined' ||
          chatItems[i] === null ||
          force === true
        ) {
          return true
        }
      }
      return false
    })
    if (chatIdsToFetch.length === 0) return
    fetching.current.push(...chatIdsToFetch)
    const chats = await DeltaBackend.call(
      'chatList.getChatListItemsByIds',
      chatIdsToFetch
    )
    fetching.current = fetching.current.filter(
      i => chatIdsToFetch.indexOf(i) === -1
    )
    return chats
  }

  const refetchChatIfInViewUnsetOtherwise = async (chatId: number) => {
    if (chatId === 0) return
    if (isChatIdInView(chatId)) {
      log.debug(
        `useLazyChatListItems: chat with id ${chatId} changed, it's in view therefore refetching`
      )
      const chats = await fetchChats([chatId], true)
      setChatItems(chatItems => {
        return { ...chatItems, ...chats }
      })
    } else {
      log.debug(
        `useLazyChatListItems: chat with id ${chatId} changed, it's NOT in view, unsetting if needed`
      )
      setChatItems(chatItems => {
        if (typeof chatItems[chatId] !== 'undefined')
          return { ...chatItems, [chatId]: undefined }
        return chatItems
      })
    }
  }

  const [onChatListScroll] = useDebouncedCallback(() => {
    fetchChatsInView(0)
  }, 30)

  const onChatListItemChanged = (
    _event: any,
    { chatId }: { chatId: number }
  ) => {
    if (chatId === 0) {
      updateChatsInViewUnsetOthers()
    } else {
      refetchChatIfInViewUnsetOtherwise(chatId)
    }
  }

  const onResize = () => fetchChatsInView(0)

  useLayoutEffect(() => {
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [chatListIds, chatItems, scrollRef])

  useEffect(() => {
    log.debug(
      'useLazyChatListItems: chatListIds changed, updating chats in view'
    )
    fetchChatsInView(0)
    ipcBackend.on('DD_EVENT_CHATLIST_ITEM_CHANGED', onChatListItemChanged)
    return () => {
      ipcBackend.removeListener(
        'DD_EVENT_CHATLIST_ITEM_CHANGED',
        onChatListItemChanged
      )
    }
  }, [chatListIds, chatItems, scrollRef])

  useEffect(() => {
    if (Object.keys(chatItems).length > 0) return
    if (!scrollRef.current) return
    fetchChatsInView(0)
  }, [chatListIds, chatItems, scrollRef])
  return { chatItems, onChatListScroll, scrollRef }
}

const debouncedSearchMessages = debounce(
  (queryStr: string, chatId: number, cb: (value: number[]) => void) => {
    DeltaBackend.call('messageList.searchMessages', queryStr, chatId).then(cb)
  },
  200
)

export function useMessageResults(queryStr: string, chatId: number = 0) {
  const [ids, setIds] = useState<number[]>([])

  const updateContacts = (queryStr: string, chatId: number = 0) =>
    debouncedSearchMessages(queryStr, chatId, setIds)

  useEffect(() => {
    DeltaBackend.call('messageList.searchMessages', queryStr, chatId).then(
      setIds
    )
  }, [])

  return [ids, updateContacts] as [number[], typeof updateContacts]
}

/// New

const debouncedGetChatListEntries = debounce(
  (
    listFlags: number,
    queryStr: string,
    queryContactId: number,
    cb: (...args: any) => void
  ) => {
    DeltaBackend.call(
      'chatList.getChatListEntries',
      listFlags,
      queryStr,
      queryContactId
    ).then(cb)
  },
  200
)

export function useChatList(
  _listFlags?: number,
  _queryStr?: string,
  _queryContactId?: number
) {
  if (!_queryStr) _queryStr = ''

  const [listFlags, setListFlags] = useState(_listFlags)
  const [queryStr, setQueryStr] = useState(_queryStr)
  const [queryContactId, setQueryContactId] = useState(_queryContactId)
  const [chatListEntries, setChatListEntries] = useState<[number, number][]>([])

  const getAndSetChatListEntries = (immediatly: boolean = false) => {
    if (immediatly === true) {
      DeltaBackend.call(
        'chatList.getChatListEntries',
        listFlags,
        queryStr,
        queryContactId
      ).then(setChatListEntries)
      return
    }
    debouncedGetChatListEntries(
      listFlags,
      queryStr,
      queryContactId,
      setChatListEntries
    )
  }

  const refetchChatlist = () => {
    log.debug('useChatList: refetchingChatlist')
    getAndSetChatListEntries()
  }

  useEffect(() => {
    log.debug('useChatList: onComponentDidMount')
    ipcBackend.on('DD_EVENT_CHATLIST_CHANGED', refetchChatlist)
    return () => {
      ipcBackend.removeListener('DD_EVENT_CHATLIST_CHANGED', refetchChatlist)
    }
  }, [listFlags, queryStr, queryContactId])

  useEffect(() => {
    log.debug(
      'useChatList: listFlags, queryStr or queryContactId changed, refetching chatlistids'
    )
    getAndSetChatListEntries()
  }, [listFlags, queryStr, queryContactId])

  console.log('chatListEntries', chatListEntries)

  return {
    chatListIds: chatListEntries,
    listFlags,
    setListFlags,
    queryStr,
    setQueryStr,
    queryContactId,
    setQueryContactId,
  }
}
