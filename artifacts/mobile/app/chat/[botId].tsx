import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { fetch } from "expo/fetch";
import * as Haptics from "expo-haptics";

import { apiFetch, apiPost, getToken, API_BASE } from "@/lib/api";
import colors from "@/constants/colors";
import type { Bot, Message, ToolCallEvent } from "@/lib/types";

let msgCounter = 0;
function uid(): string {
  msgCounter++;
  return `m-${Date.now()}-${msgCounter}-${Math.random().toString(36).substr(2, 6)}`;
}

export default function ChatScreen() {
  const { botId } = useLocalSearchParams<{ botId: string }>();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const botQuery = useQuery({
    queryKey: ["bot", botId],
    queryFn: () => apiFetch<Bot>(`bots/${botId}`),
  });

  const bot = botQuery.data;

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput("");

    const userMsg: Message = { id: uid(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setShowTyping(true);

    try {
      let convId = conversationId;
      if (!convId) {
        const conv = await apiPost<{ id: number }>("conversations", {
          botId: Number(botId),
          title: text.slice(0, 80),
        });
        convId = conv.id;
        setConversationId(convId);
      }

      const token = await getToken();
      const response = await fetch(
        `${API_BASE}api/conversations/${convId}/messages/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: text }),
        },
      );

      if (!response.ok) throw new Error("Stream failed");

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";
      let assistantAdded = false;
      const toolCalls: ToolCallEvent[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "tool_call") {
              toolCalls.push({ name: parsed.name, args: parsed.args });
              continue;
            }
            if (parsed.type === "tool_result") {
              const last = toolCalls[toolCalls.length - 1];
              if (last) last.result = parsed.result;
              continue;
            }

            if (parsed.type === "done") {
              continue;
            }

            const chunk = parsed.content || parsed.text || "";
            if (!chunk) continue;

            fullContent += chunk;

            if (!assistantAdded) {
              setShowTyping(false);
              setMessages((prev) => [
                ...prev,
                { id: uid(), role: "assistant", content: fullContent, toolCalls: [...toolCalls] },
              ]);
              assistantAdded = true;
            } else {
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: fullContent,
                  toolCalls: [...toolCalls],
                };
                return updated;
              });
            }
          } catch {}
        }
      }

      if (!assistantAdded && fullContent) {
        setShowTyping(false);
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: "assistant", content: fullContent, toolCalls },
        ]);
      }
    } catch (err) {
      setShowTyping(false);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
    }
  }, [input, isStreaming, conversationId, botId]);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.botBubble]}>
        {!isUser && !!item.toolCalls?.length && (
          <View style={styles.toolCallsWrap}>
            {item.toolCalls.map((tc, i) => (
              <View key={i} style={styles.toolCallChip}>
                <Feather name="tool" size={11} color={colors.light.tint} />
                <Text style={styles.toolCallText}>{tc.name}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.botText]}>
          {item.content}
        </Text>
      </View>
    );
  }, []);

  const reversedMessages = [...messages].reverse();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          hitSlop={12}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={22} color={colors.light.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {bot?.name || "Loading..."}
          </Text>
          {bot?.title && (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {bot.title}
            </Text>
          )}
        </View>
        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <FlatList
          data={reversedMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted={messages.length > 0}
          contentContainerStyle={[
            styles.messagesList,
            messages.length === 0 && styles.emptyList,
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            showTyping ? (
              <View style={styles.typingWrap}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, { opacity: 0.6 }]} />
                <View style={[styles.typingDot, { opacity: 0.3 }]} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <View style={styles.emptyChatIcon}>
                <Feather name="message-circle" size={28} color={colors.light.textTertiary} />
              </View>
              <Text style={styles.emptyChatTitle}>
                Start a conversation
              </Text>
              <Text style={styles.emptyChatMsg}>
                Ask {bot?.name || "the bot"} anything to get started
              </Text>
            </View>
          }
        />

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="Type a message..."
            placeholderTextColor={colors.light.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendButton, (!input.trim() || isStreaming) && { opacity: 0.4 }]}
            onPress={() => {
              handleSend();
              inputRef.current?.focus();
            }}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.light.border,
    backgroundColor: colors.light.surface,
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: "center",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.light.tint,
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: colors.light.surface,
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  bubbleText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  userText: {
    color: "#FFFFFF",
  },
  botText: {
    color: colors.light.text,
  },
  toolCallsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 6,
  },
  toolCallChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.light.tintLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  toolCallText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
  typingWrap: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: colors.light.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.light.textTertiary,
  },
  emptyChat: {
    alignItems: "center",
    gap: 8,
  },
  emptyChatIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.light.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyChatTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
  },
  emptyChatMsg: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.textSecondary,
    textAlign: "center",
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: colors.light.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: colors.light.text,
    backgroundColor: colors.light.surfaceElevated,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    maxHeight: 120,
    minHeight: 40,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
