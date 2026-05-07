import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

export default function Prospects() {
  const { data: clients = [] } = useQuery<Array<{ id: number; companyName: string }>>({
    queryKey: ["clients"],
    queryFn: async () => [] as Array<{ id: number; companyName: string }>,
  });

  return <div />;
}
