import React, { useState, useEffect } from "react";
import authService from "../utils/auth";

interface AuthImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  fallback?: React.ReactNode;
  maxRetries?: number;
  retryDelay?: number;
}

const AuthImage: React.FC<AuthImageProps> = ({
  src,
  alt,
  fallback,
  maxRetries = 3,
  retryDelay = 1000,
  ...props
}) => {
  const [imageSrc, setImageSrc] = useState<string>("");
  const [error, setError] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    let retryCount = 0;

    const fetchImage = async () => {
      try {
        setLoading(true);
        setError(false);
        const blob = await authService.fetchBlob(src);
        objectUrl = URL.createObjectURL(blob);

        if (active) {
          setImageSrc(objectUrl);
          setLoading(false);
        } else {
          // If component unmounted or src changed before fetch completed
          URL.revokeObjectURL(objectUrl);
        }
      } catch (e) {
        console.error("Failed to load image", e);
        if (active) {
          if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(() => {
              if (active) fetchImage();
            }, retryDelay);
          } else {
            setError(true);
            setLoading(false);
          }
        }
      }
    };

    if (src) {
      fetchImage();
    } else {
      setLoading(false);
      setError(true);
    }

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src, maxRetries, retryDelay]);

  if (error) {
    if (fallback) return <>{fallback}</>;
    return (
      <div
        style={{
          ...props.style,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f0f0f0",
          color: "#888",
        }}
        className={props.className}
      >
        !
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{ ...props.style, backgroundColor: "rgba(255,255,255,0.1)" }}
        className={props.className}
      />
    );
  }

  return <img src={imageSrc} alt={alt} {...props} />;
};

export default AuthImage;
