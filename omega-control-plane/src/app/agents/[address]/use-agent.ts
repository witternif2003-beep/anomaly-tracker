"use client";
import { useParams } from "next/navigation";

export function useAgentAddress(): string {
  return useParams<{ address: string }>().address;
}
