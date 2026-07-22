import { Loader2, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.scss";

export type ModalActionType = "cancel" | "confirm" | "danger";

export interface ModalAction {
  type: ModalActionType;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}

export interface ModalProps {
  title: ReactNode;
  children: ReactNode;
  actions?: ModalAction[];
  onClose: () => void;
  maxWidth?: number | string;
  bodyStyle?: CSSProperties;
  disableClose?: boolean;
  closeOnOverlayClick?: boolean;
}

export default function Modal({
  title,
  children,
  actions,
  onClose,
  maxWidth,
  bodyStyle,
  disableClose,
  closeOnOverlayClick = true,
}: ModalProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    // Trigger enter animation on mount
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    if (disableClose) return;
    setExiting(true);
  }, [disableClose]);

  return createPortal(
    <div
      className={`${styles.overlay} ${visible ? styles.overlayVisible : ""} ${exiting ? styles.overlayExiting : ""}`}
      onClick={closeOnOverlayClick && !disableClose ? handleClose : undefined}
    >
      <div
        className={`${styles.card} ${visible ? styles.cardVisible : ""} ${exiting ? styles.cardExiting : ""}`}
        onTransitionEnd={(e) => {
          if (e.propertyName === "opacity" && exiting) {
            onCloseRef.current();
          }
        }}
        style={
          maxWidth
            ? {
                maxWidth:
                  typeof maxWidth === "string" ? maxWidth : `${maxWidth}px`,
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            disabled={disableClose}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.body} style={bodyStyle}>
          {children}
        </div>
        {actions && actions.length > 0 && (
          <div className={styles.footer}>
            {actions.map((action, index) => (
              <button
                key={index}
                className={`${styles.actionButton} ${
                  action.type === "cancel"
                    ? styles.actionCancel
                    : action.type === "danger"
                      ? styles.actionDanger
                      : styles.actionConfirm
                }`}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
              >
                {action.loading ? (
                  <Loader2 size={16} className={styles.spinner} />
                ) : (
                  action.icon
                )}
                {action.loading && action.loadingLabel
                  ? action.loadingLabel
                  : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
