import React from 'react';
import { Button } from './button';

interface ModalProps {
  title: string;
  content: React.ReactNode;
  onClose: () => void;
}

export const Modal = ({ title, content, onClose }: ModalProps) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b pb-2 mb-4">
          <h2 className="text-xl font-bold">{title}</h2>
          <Button onClick={onClose} variant="ghost" className="text-gray-500 hover:text-gray-800">
            &times;
          </Button>
        </div>
        <div>
          {content}
        </div>
      </div>
    </div>
  );
};