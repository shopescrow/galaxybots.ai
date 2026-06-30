import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Swipeable } from "react-native-gesture-handler";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";

import { apiFetch, getToken, API_BASE } from "@/lib/api";
import { useClient } from "@/lib/client-context";
import { ClientSwitcher } from "@/components/ClientSwitcher";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/LoadingSkeleton";
import colors from "@/constants/colors";
import type { KnowledgeDoc } from "@/lib/types";

export default function KnowledgeScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { activeClient } = useClient();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const swipeableRefs = useRef<Map<number, Swipeable>>(new Map());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["knowledge-base", activeClient?.id],
    queryFn: () =>
      apiFetch<KnowledgeDoc[]>(
        `knowledge-base/documents${activeClient ? `?subClientId=${activeClient.id}` : ""}`
      ),
    enabled: !!activeClient,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const uploadFile = useCallback(
    async (uri: string, filename: string, mimeType: string) => {
      if (!activeClient) return;
      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const token = await getToken();
        const form = new FormData();
        form.append("file", {
          uri,
          name: filename,
          type: mimeType,
        } as unknown as Blob);

        const uploadUrl = `${API_BASE}api/knowledge-base/documents${
          activeClient ? `?subClientId=${activeClient.id}` : ""
        }`;
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
          },
          body: form,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      } catch (err) {
        Alert.alert(
          "Upload Failed",
          err instanceof Error ? err.message : "Could not upload document."
        );
      } finally {
        setUploading(false);
      }
    },
    [activeClient, queryClient]
  );

  const handleUpload = useCallback(async () => {
    Alert.alert(
      "Upload Document",
      "Supported formats: PDF, DOCX, TXT, MD",
      [
        {
          text: "Choose File",
          onPress: async () => {
            try {
              const result = await DocumentPicker.getDocumentAsync({
                type: [
                  "application/pdf",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  "text/plain",
                  "text/markdown",
                ],
                copyToCacheDirectory: true,
                multiple: false,
              });
              if (!result.canceled && result.assets.length > 0) {
                const asset = result.assets[0];
                await uploadFile(
                  asset.uri,
                  asset.name,
                  asset.mimeType || "application/octet-stream"
                );
              }
            } catch {
              Alert.alert("Error", "Could not open document picker.");
            }
          },
        },
        {
          text: "Camera Roll",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.All,
              allowsEditing: false,
              quality: 0.9,
            });
            if (!result.canceled && result.assets.length > 0) {
              const asset = result.assets[0];
              const filename =
                asset.fileName || asset.uri.split("/").pop() || "upload";
              await uploadFile(
                asset.uri,
                filename,
                asset.mimeType || "application/octet-stream"
              );
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ]
    );
  }, [activeClient, uploadFile]);

  const deleteDoc = useCallback(
    async (doc: KnowledgeDoc) => {
      setDeletingId(doc.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      try {
        const token = await getToken();
        const deleteUrl = `${API_BASE}api/knowledge-base/documents/${doc.id}${
          activeClient ? `?subClientId=${activeClient.id}` : ""
        }`;
        const res = await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            Authorization: token ? `Bearer ${token}` : "",
            "Content-Type": "application/json",
          },
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Delete failed");
        }
        queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
      } catch (err) {
        Alert.alert(
          "Error",
          err instanceof Error ? err.message : "Delete failed"
        );
      } finally {
        setDeletingId(null);
      }
    },
    [queryClient]
  );

  const handleDelete = useCallback(
    (doc: KnowledgeDoc) => {
      swipeableRefs.current.get(doc.id)?.close();
      Alert.alert(
        "Delete Document",
        `Remove "${doc.title}" from the knowledge base? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => deleteDoc(doc),
          },
        ]
      );
    },
    [deleteDoc]
  );

  const renderRightActions = useCallback(
    (doc: KnowledgeDoc) =>
      (
        _progress: Animated.AnimatedInterpolation<number>,
        dragX: Animated.AnimatedInterpolation<number>
      ) => {
        const scale = dragX.interpolate({
          inputRange: [-80, 0],
          outputRange: [1, 0],
          extrapolate: "clamp",
        });
        return (
          <View style={styles.swipeAction}>
            <Animated.View style={{ transform: [{ scale }] }}>
              {deletingId === doc.id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Pressable
                  style={styles.swipeDeleteBtn}
                  onPress={() => handleDelete(doc)}
                >
                  <Feather name="trash-2" size={20} color="#FFFFFF" />
                  <Text style={styles.swipeDeleteText}>Delete</Text>
                </Pressable>
              )}
            </Animated.View>
          </View>
        );
      },
    [deletingId, handleDelete]
  );

  const renderItem = useCallback(
    ({ item }: { item: KnowledgeDoc }) => (
      <Swipeable
        ref={(ref) => {
          if (ref) swipeableRefs.current.set(item.id, ref);
          else swipeableRefs.current.delete(item.id);
        }}
        renderRightActions={renderRightActions(item)}
        friction={2}
        rightThreshold={40}
        onSwipeableWillOpen={() =>
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        }
      >
        <View style={styles.card}>
          <View style={styles.cardIcon}>
            <Feather
              name={getDocIcon(item.fileType)}
              size={20}
              color={colors.light.tint}
            />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.docTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.docMeta}>
              <Text style={styles.docType}>
                {item.fileType?.toUpperCase() || "DOC"}
              </Text>
              <Text style={styles.docDot}>·</Text>
              <Text style={styles.docDate}>{formatDate(item.uploadedAt)}</Text>
              {item.chunkCount > 0 && (
                <>
                  <Text style={styles.docDot}>·</Text>
                  <Text style={styles.docDate}>
                    {item.chunkCount} chunk
                    {item.chunkCount !== 1 ? "s" : ""}
                  </Text>
                </>
              )}
            </View>
          </View>
          <View style={styles.swipeHint}>
            <Feather
              name="chevron-left"
              size={14}
              color={colors.light.textTertiary}
            />
          </View>
        </View>
      </Swipeable>
    ),
    [renderRightActions]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Knowledge</Text>
        <ClientSwitcher />
      </View>

      <Text style={styles.swipeHintText}>Swipe left to delete a document</Text>

      {isLoading ? (
        <ListSkeleton count={4} />
      ) : (
        <FlatList
          data={data || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: tabBarHeight + 80,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.light.tint}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="book"
              title="No documents yet"
              message="Upload PDF, DOCX, TXT or MD files to give your bots context."
              actionLabel="Upload Document"
              onAction={handleUpload}
            />
          }
        />
      )}

      <Pressable
        style={[
          styles.fab,
          { bottom: tabBarHeight + 16 },
          uploading && { opacity: 0.7 },
        ]}
        onPress={handleUpload}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Feather name="upload" size={22} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

function getDocIcon(fileType: string | null): keyof typeof Feather.glyphMap {
  if (!fileType) return "file";
  const t = fileType.toLowerCase();
  if (t === "pdf") return "file-text";
  if (t === "docx" || t === "doc") return "file";
  if (t === "md" || t === "markdown") return "hash";
  if (t === "txt") return "align-left";
  return "file";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light.background,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: colors.light.text,
  },
  swipeHintText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.light.surface,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.light.borderLight,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.light.tintLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cardContent: {
    flex: 1,
  },
  docTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.text,
    lineHeight: 20,
  },
  docMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    flexWrap: "wrap",
  },
  docType: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: colors.light.tint,
  },
  docDot: {
    fontSize: 12,
    color: colors.light.textTertiary,
  },
  docDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: colors.light.textTertiary,
  },
  swipeHint: {
    paddingLeft: 4,
  },
  swipeAction: {
    justifyContent: "center",
    alignItems: "flex-end",
    backgroundColor: colors.light.danger,
    borderRadius: 16,
    marginLeft: 8,
    paddingHorizontal: 4,
    minWidth: 80,
  },
  swipeDeleteBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 76,
    height: "100%",
    gap: 4,
    paddingVertical: 16,
  },
  swipeDeleteText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.light.tint,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.light.tint,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
});
