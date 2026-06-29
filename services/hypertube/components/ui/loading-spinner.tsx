export default function LoadingSpinner() {
    return (
        <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-6">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-700 border-t-red-500" />
        </div>
    );
}
