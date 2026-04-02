"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function VitalBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="pointer-events-none fixed inset-0 -z-50 overflow-hidden bg-background">
      {/* Base Gradient Layer */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background-elevated to-background" />

      {/* Animated Glow Top Right */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: [0.1, 0.15, 0.1],
          scale: [0.8, 1, 0.8],
          x: [0, 20, 0],
          y: [0, -20, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -right-64 -top-64 h-[40rem] w-[40rem] rounded-full bg-accent blur-[100px]"
      />

      {/* Animated Glow Bottom Left */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{
          opacity: [0.08, 0.12, 0.08],
          scale: [1, 1.2, 1],
          x: [0, -30, 0],
          y: [0, 30, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2,
        }}
        className="absolute -bottom-64 -left-64 h-[45rem] w-[45rem] rounded-full bg-gold blur-[120px]"
      />

      {/* Subtle Noise / Grain Overlay for premium texture */}
      <div 
        className="absolute inset-0 opacity-[0.015] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
